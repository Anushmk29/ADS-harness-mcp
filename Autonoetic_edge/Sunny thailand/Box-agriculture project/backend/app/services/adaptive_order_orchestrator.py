import os
import uuid
from decimal import Decimal
from typing import Any
from sqlalchemy.orm import Session

from app.models.master_data import Customer, Product
from app.models.order import ClientOrder, ClientOrderItem, OrderStatus, RawOrderFile
from app.services.canonical_schema import ActionType, CanonicalOrderDraft, IngestionChannel
from app.services.enhanced_name_matcher import EnhancedNameMatcher
from app.services.pdf_order_parser import PdfOrderParser
from app.services.purchasing_aggregator import PurchasingAggregator
from app.services.unified_excel_parser import UnifiedExcelParser
from app.services.vision_chat_parser import VisionChatParser


class AdaptiveOrderOrchestrator:
    """
    Enterprise Adaptive Multi-Modal Ingestion & Reconciliation Orchestrator.
    Handles any input format (Excel .xlsx, legacy .xls, PDF POs, and chat screenshots),
    normalizes data through the Canonical Schema, resolves products via EnhancedNameMatcher,
    and applies amendments and cancellations into the database and procurement engine.
    """

    def __init__(self, db: Session):
        self.db = db
        self.matcher = EnhancedNameMatcher(db)
        self.aggregator = PurchasingAggregator(db)

    def ingest_file(
        self,
        file_path: str,
        shipment_date: str = "2026-09-07",
        uploaded_by_id: str | None = None,
        main_customer_id: str | None = None,
        route_line: str | None = None,
    ) -> dict[str, Any]:
        """
        Universal entrypoint for any order file format.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_name = os.path.basename(file_path)
        ext = os.path.splitext(file_path)[1].lower()

        # 1. Parse into Canonical Order Drafts
        if ext == ".pdf":
            parser = PdfOrderParser(file_path)
            drafts = [parser.parse()]
        elif ext in [".png", ".jpg", ".jpeg"]:
            parser = VisionChatParser(file_path)
            drafts = [parser.parse()]
        elif ext in [".xlsx", ".xls"]:
            parser = UnifiedExcelParser(file_path)
            drafts = parser.parse()
        else:
            raise ValueError(f"Unsupported file format: {ext}")

        # 2. Persist RawOrderFile Record
        user_id = uploaded_by_id or "system-intake"
        main_cust = None
        if main_customer_id:
            main_cust = self.db.query(Customer).filter(Customer.id == main_customer_id).first()
        if not main_cust:
            main_cust_code = drafts[0].main_customer_code if drafts else "GENERAL"
            main_cust = self._get_or_create_customer(main_cust_code, is_main=True)

        target_route = route_line or (drafts[0].route_line if drafts else "GENERAL") or "GENERAL"
        raw_file = RawOrderFile(
            id=str(uuid.uuid4()),
            file_name=file_name,
            storage_url=file_path,
            shipment_target_date=drafts[0].shipment_date or shipment_date,
            route_line=target_route,
            uploaded_by=user_id,
            main_customer_id=main_cust.id,
            detected_sub_customer_count=len(drafts),
            status=OrderStatus.PARSED,
        )
        self.db.add(raw_file)
        self.db.commit()

        # 3. Process Drafts and Create Client Orders
        created_orders = []
        total_items_processed = 0
        matched_items_count = 0
        unmatched_items_count = 0
        total_weight_kg = Decimal("0.00")

        for draft in drafts:
            order_res = self._process_single_draft(raw_file, draft)
            created_orders.append(order_res["order_ref"])
            total_items_processed += order_res["total_items"]
            matched_items_count += order_res["matched_items"]
            unmatched_items_count += order_res["unmatched_items"]
            total_weight_kg += order_res["net_weight_kg"]

        # 4. Trigger Consolidated Purchasing Aggregation
        procurement_summary = self.aggregator.consolidate_demand(raw_file_id=raw_file.id)

        return {
            "file_name": file_name,
            "channel": drafts[0].channel.value if drafts else "UNKNOWN",
            "raw_file_id": raw_file.id,
            "detected_sub_customers": len(drafts),
            "created_orders": created_orders,
            "total_items_processed": total_items_processed,
            "matched_items_count": matched_items_count,
            "unmatched_items_count": unmatched_items_count,
            "match_rate_percentage": round(
                (matched_items_count / total_items_processed * 100) if total_items_processed > 0 else 0,
                1,
            ),
            "total_net_weight_kg": float(total_weight_kg),
            "procurement_consolidated_skus": len(procurement_summary.items) if procurement_summary and hasattr(procurement_summary, "items") else 0,
        }

    def _process_single_draft(self, raw_file: RawOrderFile, draft: CanonicalOrderDraft) -> dict[str, Any]:
        """Converts a CanonicalOrderDraft into a ClientOrder with ClientOrderItems."""
        client_code = draft.client_code
        sub_cust = self._get_or_create_customer(
            client_code=client_code,
            company_name=draft.client_name or f"Client {client_code}",
            route_group=draft.route_line or "GENERAL",
            country=draft.destination_country or "General Export",
            parent_id=raw_file.main_customer_id,
        )

        order_ref = f"ORD-{raw_file.shipment_target_date.replace('-', '')}-{client_code}"
        # Check if order already exists (for updates / delta amendments)
        existing_order = self.db.query(ClientOrder).filter(ClientOrder.order_ref_id == order_ref).first()
        if existing_order:
            client_order = existing_order
        else:
            client_order = ClientOrder(
                id=str(uuid.uuid4()),
                raw_order_file_id=raw_file.id,
                customer_id=sub_cust.id,
                main_customer_id=raw_file.main_customer_id,
                order_ref_id=order_ref,
                total_ordered_items_count=0,
                total_estimated_net_weight_kg=Decimal("0.00"),
                status=OrderStatus.SPLIT_AND_VALIDATED,
            )
            self.db.add(client_order)
            self.db.commit()

        matched_count = 0
        unmatched_count = 0
        order_weight = Decimal("0.00")
        active_items_count = 0

        for item in draft.items:
            # Match product
            search_text = item.product_name or item.raw_text
            product, method, conf = self.matcher.match_item(
                raw_text=search_text,
                declared_code=item.product_code,
                main_customer_id=raw_file.main_customer_id,
            )

            # Fallback product if unmatched to prevent schema breaking
            if not product:
                unmatched_count += 1
                product = self._get_fallback_product()
            else:
                matched_count += 1

            # Handle Actions (ORDER, CANCEL, UPDATE)
            qty = Decimal(str(item.quantity))
            if item.action == ActionType.CANCEL:
                qty = Decimal("0.00")

            weight_kg = qty
            if item.unit.lower() in ["g", "gms"] and qty > Decimal("10"):
                weight_kg = qty / Decimal("1000")

            order_item = ClientOrderItem(
                id=str(uuid.uuid4()),
                client_order_id=client_order.id,
                product_id=product.id,
                raw_produce_text=item.raw_text,
                pack_size=item.pack_size or "std",
                ordered_pack_count=int(qty) if item.unit == "pack" else max(1, int(qty)),
                estimated_net_weight_kg=weight_kg,
            )
            self.db.add(order_item)

            if item.action != ActionType.CANCEL and weight_kg > Decimal("0.00"):
                active_items_count += 1
                order_weight += weight_kg

        client_order.total_ordered_items_count += active_items_count
        client_order.total_estimated_net_weight_kg += order_weight
        self.db.commit()

        return {
            "order_ref": order_ref,
            "total_items": len(draft.items),
            "matched_items": matched_count,
            "unmatched_items": unmatched_count,
            "net_weight_kg": order_weight,
        }

    def _get_or_create_customer(
        self,
        client_code: str,
        company_name: str | None = None,
        route_group: str = "GENERAL",
        country: str = "Export",
        parent_id: str | None = None,
        is_main: bool = False,
    ) -> Customer:
        cust = self.db.query(Customer).filter(Customer.client_code == client_code).first()
        if not cust:
            cust = Customer(
                id=str(uuid.uuid4()),
                client_code=client_code,
                company_name=company_name or f"Company {client_code}",
                billing_email=f"billing@{client_code.lower()}.com",
                route_group=route_group,
                destination_country=country,
                is_main_customer=is_main,
                parent_customer_id=parent_id,
            )
            self.db.add(cust)
            self.db.commit()
        return cust

    def _get_fallback_product(self) -> Product:
        fallback = self.db.query(Product).filter(Product.t_code == "MISC-UNMATCHED").first()
        if not fallback:
            from app.models.master_data import BoxMaterial, ControlStatus, ProduceType, TemperatureZone, WeightClass
            fallback = Product(
                id=str(uuid.uuid4()),
                t_code="MISC-UNMATCHED",
                numeric_code="99999",
                name_en="Unmatched Miscellaneous Item",
                name_th="สินค้าไม่ระบุรหัส",
                name_vi="Hàng Chưa Phân Loại",
                box_material=BoxMaterial.CARDBOARD,
                temperature=TemperatureZone.NORMAL,
                control_status=ControlStatus.COMBINABLE,
                produce_type=ProduceType.HERB,
                weight_class=WeightClass.LIGHT,
            )
            self.db.add(fallback)
            self.db.commit()
        return fallback
