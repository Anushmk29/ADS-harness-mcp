import math
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.order import RawOrderFile, ClientOrder, ClientOrderItem, OrderStatus
from app.models.master_data import Product
from app.models.procurement import MasterPurchasingList, PurchasingItem, PurchasingOrderSource

class PurchasingAggregator:
    def __init__(self, db: Session):
        self.db = db

    def consolidate_demand(self, raw_file_id: str) -> MasterPurchasingList:
        """Consolidates single raw order file with default product buffer percentages applied."""
        raw_file = self.db.query(RawOrderFile).filter(RawOrderFile.id == raw_file_id).first()
        if not raw_file:
            raise ValueError(f"RawOrderFile {raw_file_id} not found")

        return self.combine_and_consolidate(
            raw_file_ids=[raw_file.id],
            shipment_date=raw_file.shipment_target_date,
            batch_ref=f"PUR-{raw_file.shipment_target_date.replace('-', '')}-BATCH1"
        )

    def combine_and_consolidate(
        self,
        raw_file_ids: List[str],
        client_order_ids: Optional[List[str]] = None,
        batch_ref: Optional[str] = None,
        shipment_date: Optional[str] = None,
        route_code: Optional[str] = None
    ) -> MasterPurchasingList:
        """
        Multi-Order Combination Merge Tool:
        Combines multiple main customer orders or raw files into a single unified Master Purchase Order.
        Applies sticky buffer percentages per product to compensate for harvest/sorting waste.
        """
        if not batch_ref:
            date_str = shipment_date.replace("-", "") if shipment_date else "BATCH"
            batch_ref = f"PUR-{date_str}-COMBINED-{len(raw_file_ids)}FILES"

        # Check existing
        existing_mpl = self.db.query(MasterPurchasingList).filter(MasterPurchasingList.batch_reference == batch_ref).first()
        if existing_mpl:
            mpl = existing_mpl
            self.db.query(PurchasingItem).filter(PurchasingItem.purchasing_list_id == mpl.id).delete()
            self.db.query(PurchasingOrderSource).filter(PurchasingOrderSource.purchasing_list_id == mpl.id).delete()
        else:
            mpl = MasterPurchasingList(
                raw_order_file_id=raw_file_ids[0] if raw_file_ids else None,
                batch_reference=batch_ref,
                shipment_date=shipment_date,
                route_code=route_code,
                total_skus_count=0,
                status=OrderStatus.PURCHASING_CONSOLIDATED
            )
            self.db.add(mpl)
            self.db.flush()

        # Link order sources
        for r_id in raw_file_ids:
            source = PurchasingOrderSource(
                purchasing_list_id=mpl.id,
                raw_order_file_id=r_id
            )
            self.db.add(source)

        if client_order_ids:
            for c_id in client_order_ids:
                source = PurchasingOrderSource(
                    purchasing_list_id=mpl.id,
                    client_order_id=c_id
                )
                self.db.add(source)

        # Build demand aggregation query
        query = (
            self.db.query(
                ClientOrderItem.product_id,
                ClientOrderItem.pack_size,
                func.sum(ClientOrderItem.ordered_pack_count).label("total_packs"),
                func.sum(ClientOrderItem.estimated_net_weight_kg).label("total_weight")
            )
            .join(ClientOrder, ClientOrderItem.client_order_id == ClientOrder.id)
        )

        if raw_file_ids and client_order_ids:
            query = query.filter(
                (ClientOrder.raw_order_file_id.in_(raw_file_ids)) | (ClientOrder.id.in_(client_order_ids))
            )
        elif raw_file_ids:
            query = query.filter(ClientOrder.raw_order_file_id.in_(raw_file_ids))
        elif client_order_ids:
            query = query.filter(ClientOrder.id.in_(client_order_ids))

        results = query.group_by(ClientOrderItem.product_id, ClientOrderItem.pack_size).all()

        sku_count = 0
        for prod_id, pack, total_packs, total_weight in results:
            product = self.db.query(Product).filter(Product.id == prod_id).first()
            buffer_pct = float(product.default_buffer_percentage or 0.0) if product else 0.0

            ordered_packs = int(total_packs or 0)
            ordered_kg = round(float(total_weight or 0.0), 2)
            buffer_kg = round(ordered_kg * (buffer_pct / 100.0), 2)
            total_purchasing_kg = round(ordered_kg + buffer_kg, 2)
            total_purchasing_packs = math.ceil(ordered_packs * (1.0 + buffer_pct / 100.0))

            p_item = PurchasingItem(
                purchasing_list_id=mpl.id,
                product_id=prod_id,
                pack_size=pack,
                ordered_net_weight_kg=ordered_kg,
                buffer_percentage=buffer_pct,
                buffer_weight_kg=buffer_kg,
                total_required_pack_count=total_purchasing_packs,
                total_required_weight_kg=total_purchasing_kg,
                confirmed_purchased_pack_count=total_purchasing_packs,
                confirmed_purchased_weight_kg=total_purchasing_kg
            )
            self.db.add(p_item)
            sku_count += 1

        mpl.total_skus_count = sku_count
        for r_id in raw_file_ids:
            rf = self.db.query(RawOrderFile).filter(RawOrderFile.id == r_id).first()
            if rf:
                rf.status = OrderStatus.PURCHASING_CONSOLIDATED

        self.db.commit()
        return mpl

    def update_product_buffer(
        self,
        product_id: str,
        new_buffer_pct: float,
        purchasing_item_id: Optional[str] = None,
        save_as_default: bool = True
    ) -> Dict[str, Any]:
        """
        Updates buffer percentage. If save_as_default is True, updates Product master
        so the system remembers and defaults to this buffer for future identical orders.
        """
        product = self.db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise ValueError(f"Product {product_id} not found")

        if save_as_default:
            product.default_buffer_percentage = round(new_buffer_pct, 2)

        item_result = None
        if purchasing_item_id:
            item = self.db.query(PurchasingItem).filter(PurchasingItem.id == purchasing_item_id).first()
            if item:
                item.buffer_percentage = round(new_buffer_pct, 2)
                item.buffer_weight_kg = round(float(item.ordered_net_weight_kg) * (new_buffer_pct / 100.0), 2)
                item.total_required_weight_kg = round(float(item.ordered_net_weight_kg) + float(item.buffer_weight_kg), 2)
                item.total_required_pack_count = math.ceil(
                    (float(item.ordered_net_weight_kg) / max(0.01, float(item.ordered_net_weight_kg) / max(1, item.total_required_pack_count))) * (1 + new_buffer_pct / 100.0)
                ) if item.total_required_pack_count > 0 else 0
                item_result = {
                    "item_id": item.id,
                    "buffer_percentage": float(item.buffer_percentage),
                    "buffer_weight_kg": float(item.buffer_weight_kg),
                    "total_required_weight_kg": float(item.total_required_weight_kg)
                }

        self.db.commit()
        return {
            "product_id": product.id,
            "product_name": f"{product.name_vi} / {product.name_en}",
            "default_buffer_percentage": float(product.default_buffer_percentage),
            "updated_item": item_result
        }
