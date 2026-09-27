from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.models.master_data import Customer
from app.models.order import ClientOrder, ClientOrderItem, OrderStatus, RawOrderFile
from app.models.user import User
from app.modules.workflow.service import WorkflowService
from app.services.name_matcher import NameFirstMatcher


def parse_pack_size_weight(pack_str: str) -> float:
    """Helper to derive approximate net weight in kg from pack size string."""
    pack_str = pack_str.lower().strip()
    if "100g" in pack_str:
        return 0.10
    if "200g" in pack_str:
        return 0.20
    if "500g" in pack_str:
        return 0.50
    if "1kg" in pack_str or "kg" in pack_str:
        return 1.00
    if "80 g" in pack_str:
        return 0.08
    if "50 g" in pack_str:
        return 0.05
    return 0.15


class OrderSplitter:
    def __init__(self, db: Session):
        self.db = db
        self.matcher = NameFirstMatcher(db)

    def split_raw_order(
        self,
        raw_file_id: str,
        parsed_data: dict[str, Any],
        main_customer_id: str | None = None,
        actor: User | None = None,
    ) -> list[ClientOrder]:
        raw_file = self.db.query(RawOrderFile).filter(RawOrderFile.id == raw_file_id).first()
        if not raw_file:
            raise ValueError(f"RawOrderFile {raw_file_id} not found")

        active_main_customer_id = main_customer_id or raw_file.main_customer_id
        created_orders = []
        clients_data = parsed_data.get("clients_data", {})
        clients_groups = parsed_data.get("clients_groups", {})

        for client_code, items in clients_data.items():
            positive_items = []
            for item in items:
                try:
                    quantity = int(item.get("quantity") or 0)
                except (TypeError, ValueError):
                    quantity = 0
                if quantity > 0:
                    positive_items.append({**item, "quantity": quantity})
            if not positive_items:
                continue
            items = positive_items

            detected_group = clients_groups.get(client_code) or raw_file.route_line

            # Resolve Sub-Customer
            customer = self.db.query(Customer).filter(Customer.client_code == client_code).first()
            if not customer:
                customer = Customer(
                    client_code=client_code,
                    company_name=f"Sub-Customer {client_code}",
                    billing_email=f"{client_code.lower().replace(' ', '_')}@clienttrade.eu",
                    route_group=detected_group,
                    destination_country=("Norway" if "NGA" in detected_group.upper() else "France"),
                    is_main_customer=False,
                    parent_customer_id=active_main_customer_id,
                )
                self.db.add(customer)
                self.db.flush()
            else:
                if detected_group:
                    customer.route_group = detected_group
                if active_main_customer_id and not customer.parent_customer_id:
                    customer.parent_customer_id = active_main_customer_id

            order_ref = f"ORD-{raw_file.shipment_target_date.replace('-', '')}-{client_code.replace(' ', '_')}"

            # Check existing
            existing_order = (
                self.db.query(ClientOrder).filter(ClientOrder.order_ref_id == order_ref).first()
            )
            if existing_order:
                client_order = existing_order
                client_order.raw_order_file_id = raw_file.id
                client_order.main_customer_id = active_main_customer_id
                client_order.status = OrderStatus.SPLIT_AND_VALIDATED
                self.db.query(ClientOrderItem).filter(
                    ClientOrderItem.client_order_id == client_order.id
                ).delete()
            else:
                client_order = ClientOrder(
                    raw_order_file_id=raw_file.id,
                    customer_id=customer.id,
                    main_customer_id=active_main_customer_id,
                    order_ref_id=order_ref,
                    status=OrderStatus.SPLIT_AND_VALIDATED,
                )
                self.db.add(client_order)
                self.db.flush()

            # Deduplication Engine: Aggregate items by (product_id, pack_size) using defaultdict
            aggregated_items: dict[tuple[str, str], dict[str, Any]] = defaultdict(
                lambda: {"raw_texts": [], "quantity": 0, "est_kg": 0.0}
            )

            for it in items:
                prod, match_type, conf = self.matcher.resolve_product_names(
                    [it["name_vi"], it["name_en"]],
                    raw_code=it["t_code"],
                    main_customer_id=active_main_customer_id,
                )
                if not prod:
                    raise ValueError(
                        f"Unresolved product '{it['t_code']} - {it['name_vi'] or it['name_en']}'. "
                        "Create a verified SKU mapping before splitting."
                    )

                pack_weight = parse_pack_size_weight(it["pack_size"])
                qty = int(it["quantity"])
                est_kg = round(qty * pack_weight, 2)
                names = " / ".join(filter(None, [it["name_vi"], it["name_en"]]))
                raw_text = " - ".join(filter(None, [it["t_code"], names]))

                agg = aggregated_items[(prod.id, it["pack_size"])]
                agg["quantity"] += qty
                agg["est_kg"] = round(agg["est_kg"] + est_kg, 2)
                if raw_text not in agg["raw_texts"]:
                    agg["raw_texts"].append(raw_text)

            total_items = 0
            total_net_kg = 0.0

            for (prod_id, pack_size), agg in aggregated_items.items():
                combined_raw_text = "; ".join(agg["raw_texts"][:2])
                order_item = ClientOrderItem(
                    client_order_id=client_order.id,
                    product_id=prod_id,
                    raw_produce_text=combined_raw_text,
                    pack_size=pack_size,
                    ordered_pack_count=agg["quantity"],
                    unit_price_eur=1.50,  # Default base price
                    estimated_net_weight_kg=agg["est_kg"],
                )
                self.db.add(order_item)
                total_items += agg["quantity"]
                total_net_kg += agg["est_kg"]

            client_order.total_ordered_items_count = total_items
            client_order.total_estimated_net_weight_kg = round(total_net_kg, 2)
            created_orders.append(client_order)

        if actor:
            WorkflowService(self.db).transition(
                target=raw_file,
                to_status=OrderStatus.SPLIT_AND_VALIDATED,
                actor=actor,
                target_table="raw_order_files",
            )
        else:
            raw_file.status = OrderStatus.SPLIT_AND_VALIDATED
        if active_main_customer_id:
            raw_file.main_customer_id = active_main_customer_id
        raw_file.detected_sub_customer_count = len(created_orders)
        self.db.commit()
        return created_orders
