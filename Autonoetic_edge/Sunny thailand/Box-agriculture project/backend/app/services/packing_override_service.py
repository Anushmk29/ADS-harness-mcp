import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit import AgentHandoff, AuditLog
from app.models.master_data import BoxCatalogue, Customer
from app.models.order import ClientOrder, OrderStatus, RawOrderFile
from app.models.packing import AdjustmentType, Box, BoxItem, TransportationManifest
from app.models.user import User


def compute_volumetric_weight(length_cm: float, width_cm: float, height_cm: float) -> float:
    """IATA standard air freight volumetric weight: (L * W * H in cm) / 6000"""
    return round((length_cm * width_cm * height_cm) / 6000.0, 2)


class PackingOverrideService:
    def __init__(self, db: Session):
        self.db = db

    def override_box_size(
        self,
        box_id: str,
        new_catalogue_id: str | None = None,
        custom_length_cm: float | None = None,
        custom_width_cm: float | None = None,
        custom_height_cm: float | None = None,
        override_reason: str | None = None,
    ) -> Box:
        """
        Allows packing floor staff to adjust box catalogue size or custom dimensions
        to match physical reality if inventory differs from the initial packing plan.
        """
        box = self.db.query(Box).filter(Box.id == box_id).first()
        if not box:
            raise ValueError(f"Box {box_id} not found")
        if box.is_locked:
            raise ValueError(f"Box {box_id} is locked and immutable")

        length, width, height = None, None, None

        if new_catalogue_id:
            catalogue = (
                self.db.query(BoxCatalogue).filter(BoxCatalogue.id == new_catalogue_id).first()
            )
            if not catalogue:
                raise ValueError(f"BoxCatalogue {new_catalogue_id} not found")
            box.override_box_catalogue_id = catalogue.id
            length = float(catalogue.length_cm)
            width = float(catalogue.width_cm)
            height = float(catalogue.height_cm)

        if custom_length_cm and custom_width_cm and custom_height_cm:
            box.custom_length_cm = round(custom_length_cm, 2)
            box.custom_width_cm = round(custom_width_cm, 2)
            box.custom_height_cm = round(custom_height_cm, 2)
            length, width, height = custom_length_cm, custom_width_cm, custom_height_cm

        if length and width and height:
            box.volumetric_weight_kg = compute_volumetric_weight(length, width, height)
            gross = float(box.actual_gross_weight_kg or 0.0)
            box.chargeable_weight_kg = max(gross, float(box.volumetric_weight_kg))

        box.is_manually_overridden = True
        if override_reason:
            box.override_reason = override_reason

        self.db.commit()
        self.db.refresh(box)
        return box

    def add_extra_box_to_order(
        self,
        client_order_id: str,
        box_catalogue_id: str,
        shipment_date: str,
        route_code: str,
        is_mixed_box: bool = True,
    ) -> Box:
        """
        Dynamically adds an extra physical box to a sub-customer order,
        allowing packers to increase total box count on the floor.
        """
        order = self.db.query(ClientOrder).filter(ClientOrder.id == client_order_id).first()
        if not order:
            raise ValueError(f"ClientOrder {client_order_id} not found")

        cat = self.db.query(BoxCatalogue).filter(BoxCatalogue.id == box_catalogue_id).first()
        if not cat:
            raise ValueError(f"BoxCatalogue {box_catalogue_id} not found")

        # Find highest box number
        existing_boxes = self.db.query(Box).filter(Box.client_order_id == client_order_id).all()
        max_no = max([b.box_number for b in existing_boxes], default=0)

        box_uuid = str(uuid.uuid4())
        qr_code_uid = (
            f"BOX-{route_code}-{shipment_date.replace('-', '')}-{max_no + 1:03d}-{box_uuid[:8]}"
        )
        vol_wt = compute_volumetric_weight(
            float(cat.length_cm), float(cat.width_cm), float(cat.height_cm)
        )

        new_box = Box(
            id=box_uuid,
            client_order_id=client_order_id,
            box_catalogue_id=cat.id,
            box_number=max_no + 1,
            shipment_date=shipment_date,
            route_code=route_code,
            is_mixed_box=is_mixed_box,
            qr_code_uid=qr_code_uid,
            qr_image_url=(f"{settings.PUBLIC_APP_URL.rstrip('/')}/scan/{qr_code_uid}"),
            volumetric_weight_kg=vol_wt,
            chargeable_weight_kg=vol_wt,
            is_locked=False,
        )
        self.db.add(new_box)
        self.db.commit()
        self.db.refresh(new_box)
        return new_box

    def move_items_between_boxes(
        self,
        source_box_id: str,
        target_box_id: str,
        product_id: str,
        pack_size: str,
        quantity_to_move: int,
        net_weight_kg: float,
    ) -> dict[str, Any]:
        """Allows packers to reallocate produce items between boxes."""
        source_box = self.db.query(Box).filter(Box.id == source_box_id).first()
        target_box = self.db.query(Box).filter(Box.id == target_box_id).first()
        if not source_box or not target_box:
            raise ValueError("Source or target box not found")
        if source_box.id == target_box.id:
            raise ValueError("Source and target boxes must be different")
        if source_box.is_locked or target_box.is_locked:
            raise ValueError("Cannot move items on locked boxes")

        source_item = (
            self.db.query(BoxItem)
            .filter(
                BoxItem.box_id == source_box_id,
                BoxItem.product_id == product_id,
                BoxItem.pack_size == pack_size,
            )
            .first()
        )

        if not source_item or source_item.final_packed_count < quantity_to_move:
            raise ValueError("Insufficient quantity in source box to move")

        # Reduce from source
        source_item.final_packed_count -= quantity_to_move
        source_item.final_net_weight_kg = max(
            0.0, round(float(source_item.final_net_weight_kg) - net_weight_kg, 2)
        )
        source_item.adjustment_type = AdjustmentType.SHORTAGE_REDUCED
        source_item.adjustment_notes = (
            f"Moved {quantity_to_move} packs to Box #{target_box.box_number}"
        )

        if source_item.final_packed_count == 0:
            self.db.delete(source_item)

        # Add to target
        target_item = (
            self.db.query(BoxItem)
            .filter(
                BoxItem.box_id == target_box_id,
                BoxItem.product_id == product_id,
                BoxItem.pack_size == pack_size,
            )
            .first()
        )

        if target_item:
            target_item.final_packed_count += quantity_to_move
            target_item.final_net_weight_kg = round(
                float(target_item.final_net_weight_kg) + net_weight_kg, 2
            )
            target_item.adjustment_type = AdjustmentType.QUANTITY_INCREASED
            target_item.adjustment_notes = (
                f"Received {quantity_to_move} packs from Box #{source_box.box_number}"
            )
        else:
            target_item = BoxItem(
                box_id=target_box_id,
                product_id=product_id,
                pack_size=pack_size,
                final_packed_count=quantity_to_move,
                final_net_weight_kg=round(net_weight_kg, 2),
                adjustment_type=AdjustmentType.QUANTITY_INCREASED,
                adjustment_notes=f"Received {quantity_to_move} packs from Box #{source_box.box_number}",
            )
            self.db.add(target_item)

        self.db.commit()
        return {
            "source_box_id": source_box_id,
            "target_box_id": target_box_id,
            "moved_packs": quantity_to_move,
            "moved_net_kg": net_weight_kg,
        }

    def sync_transportation_manifest(
        self,
        route_code: str,
        shipment_date: str,
        flight_carrier: str | None = None,
    ) -> TransportationManifest:
        """
        Automatically syncs finalized packing lists to generate accurate
        transportation manifests / freight invoices for shipping container management.
        """
        ref = f"TRN-{shipment_date.replace('-', '')}-{route_code}"
        manifest = (
            self.db.query(TransportationManifest)
            .filter(TransportationManifest.manifest_reference == ref)
            .first()
        )

        boxes = (
            self.db.query(Box)
            .filter(Box.route_code == route_code, Box.shipment_date == shipment_date)
            .all()
        )

        total_boxes = len(boxes)
        total_gross = 0.0
        total_net = 0.0
        total_vol = 0.0

        for b in boxes:
            total_gross += float(b.actual_gross_weight_kg or 0.0)
            total_net += float(b.actual_net_weight_kg or 0.0)

            # Determine dimensions
            if b.custom_length_cm and b.custom_width_cm and b.custom_height_cm:
                length, width, height = (
                    float(b.custom_length_cm),
                    float(b.custom_width_cm),
                    float(b.custom_height_cm),
                )
            elif b.override_box_type:
                length, width, height = (
                    float(b.override_box_type.length_cm),
                    float(b.override_box_type.width_cm),
                    float(b.override_box_type.height_cm),
                )
            elif b.box_type:
                length, width, height = (
                    float(b.box_type.length_cm),
                    float(b.box_type.width_cm),
                    float(b.box_type.height_cm),
                )
            else:
                length, width, height = 38.0, 32.0, 18.0

            vol = compute_volumetric_weight(length, width, height)
            total_vol += vol

        chargeable = max(total_gross, total_vol)

        if not manifest:
            manifest = TransportationManifest(
                manifest_reference=ref,
                route_code=route_code,
                shipment_date=shipment_date,
                flight_carrier=flight_carrier,
                total_boxes_count=total_boxes,
                total_gross_weight_kg=round(total_gross, 2),
                total_net_weight_kg=round(total_net, 2),
                total_volumetric_weight_kg=round(total_vol, 2),
                total_chargeable_weight_kg=round(chargeable, 2),
                status="LOCKED",
            )
            self.db.add(manifest)
        else:
            manifest.flight_carrier = flight_carrier
            manifest.total_boxes_count = total_boxes
            manifest.total_gross_weight_kg = round(total_gross, 2)
            manifest.total_net_weight_kg = round(total_net, 2)
            manifest.total_volumetric_weight_kg = round(total_vol, 2)
            manifest.total_chargeable_weight_kg = round(chargeable, 2)
            manifest.status = "LOCKED"

        self.db.commit()
        self.db.refresh(manifest)
        return manifest

    def transfer_box_contents(
        self,
        source_box_id: str,
        target_box_id: str,
        item_ids: list[str] | None = None,
        remove_empty_source: bool = False,
        actor: User | None = None,
    ) -> dict[str, Any]:
        """
        Smart Box Resizing Workflow:
        Transfers items from smaller boxes into a larger box (e.g., combining Small and Medium into Large).
        Transfers item data, product IDs, pack counts, and weights automatically without manual re-typing.
        """
        source_box = self.db.query(Box).filter(Box.id == source_box_id).first()
        target_box = self.db.query(Box).filter(Box.id == target_box_id).first()
        if not source_box or not target_box:
            raise ValueError("Source or target box not found")
        if source_box.is_locked or target_box.is_locked:
            raise ValueError("Cannot transfer items between locked boxes")
        if source_box.client_order_id != target_box.client_order_id:
            raise ValueError("Box transfers must stay within the same client order")
        if (
            source_box.shipment_date != target_box.shipment_date
            or source_box.route_code != target_box.route_code
        ):
            raise ValueError("Box transfers must stay within the same shipment route and date")

        # Find items to transfer
        q = self.db.query(BoxItem).filter(BoxItem.box_id == source_box_id)
        if item_ids:
            q = q.filter(BoxItem.id.in_(item_ids))
        items_to_move = q.all()

        if not items_to_move:
            raise ValueError("No items found in source box to transfer")

        target_material = (target_box.override_box_type or target_box.box_type).box_type
        incompatible = [
            item.product.t_code
            for item in items_to_move
            if item.product and item.product.box_material != target_material
        ]
        if incompatible:
            raise ValueError(f"Target box material is incompatible with: {', '.join(incompatible)}")
        target_existing_weight = sum(float(item.final_net_weight_kg) for item in target_box.items)
        transfer_weight = sum(float(item.final_net_weight_kg) for item in items_to_move)
        target_capacity = float(
            (target_box.override_box_type or target_box.box_type).max_safe_net_weight_kg
        )
        if target_existing_weight + transfer_weight > target_capacity + 0.01:
            raise ValueError("Transfer would exceed the target box safe capacity")

        transferred_count = 0
        transferred_weight = 0.0

        for s_item in items_to_move:
            qty = s_item.final_packed_count
            wt = float(s_item.final_net_weight_kg)

            # Check if target box already has this produce SKU and pack size
            existing_target_item = (
                self.db.query(BoxItem)
                .filter(
                    BoxItem.box_id == target_box_id,
                    BoxItem.product_id == s_item.product_id,
                    BoxItem.pack_size == s_item.pack_size,
                )
                .first()
            )

            if existing_target_item:
                existing_target_item.final_packed_count += qty
                existing_target_item.final_net_weight_kg = round(
                    float(existing_target_item.final_net_weight_kg) + wt, 2
                )
                existing_target_item.adjustment_type = AdjustmentType.QUANTITY_INCREASED
                existing_target_item.adjustment_notes = (
                    f"Combined from Box #{source_box.box_number}"
                )
                self.db.delete(s_item)
            else:
                # Reassign item directly to target box
                s_item.box_id = target_box_id
                s_item.adjustment_type = AdjustmentType.QUANTITY_INCREASED
                s_item.adjustment_notes = f"Transferred from Box #{source_box.box_number}"

            transferred_count += qty
            transferred_weight = round(transferred_weight + wt, 2)

        # Recalculate weights on both boxes
        self.db.flush()
        source_remaining = self.db.query(BoxItem).filter(BoxItem.box_id == source_box_id).all()
        target_all = self.db.query(BoxItem).filter(BoxItem.box_id == target_box_id).all()

        # A physical content change invalidates prior scale readings. Floor staff must
        # capture both weights again before the final pack can be locked.
        source_box.actual_net_weight_kg = None
        source_box.actual_gross_weight_kg = None
        target_box.actual_net_weight_kg = None
        target_box.actual_gross_weight_kg = None

        source_box_removed = False
        if remove_empty_source and len(source_remaining) == 0:
            self.db.delete(source_box)
            source_box_removed = True

        if actor:
            self.db.add(
                AuditLog(
                    event_type="BOX_CONTENTS_TRANSFERRED",
                    actor_id=actor.id,
                    actor_role=actor.role.value,
                    target_table="boxes",
                    target_id=target_box.id,
                    before_state={"source_box_id": source_box_id},
                    after_state={
                        "transferred_pack_count": transferred_count,
                        "transferred_net_weight_kg": transferred_weight,
                        "weights_require_recapture": True,
                    },
                )
            )

        self.db.commit()

        return {
            "source_box_id": source_box_id,
            "target_box_id": target_box_id,
            "transferred_items_count": len(items_to_move),
            "transferred_pack_count": transferred_count,
            "transferred_net_weight_kg": transferred_weight,
            "target_box_new_net_kg": round(
                sum(float(item.final_net_weight_kg) for item in target_all), 2
            ),
            "source_box_remaining_items": len(source_remaining),
            "source_box_removed": source_box_removed,
        }

    def generate_vehicle_loading_export(
        self, route_code: str, shipment_date: str
    ) -> dict[str, Any]:
        """
        Generates a vehicle loading summary file that outputs the exact number of boxes per customer
        (e.g., 'Tete: 10 boxes', 'BE-DUYÊN: 3 boxes') for floor staff to double-check vehicle load totals.
        """
        boxes = (
            self.db.query(Box)
            .filter(Box.route_code == route_code, Box.shipment_date == shipment_date)
            .order_by(Box.box_number)
            .all()
        )

        customer_counts: dict[str, dict[str, Any]] = {}
        total_boxes = len(boxes)
        total_gross = 0.0
        total_net = 0.0

        for b in boxes:
            cust_name = (
                b.order.customer.company_name if (b.order and b.order.customer) else "General"
            )
            cust_code = b.order.customer.client_code if (b.order and b.order.customer) else "GEN"
            key = cust_code
            if key not in customer_counts:
                customer_counts[key] = {
                    "customer_code": cust_code,
                    "company_name": cust_name,
                    "boxes_count": 0,
                    "box_numbers": [],
                    "total_net_kg": 0.0,
                    "total_gross_kg": 0.0,
                }
            customer_counts[key]["boxes_count"] += 1
            customer_counts[key]["box_numbers"].append(b.box_number)
            net_wt = float(b.actual_net_weight_kg or 0.0)
            gross_wt = float(b.actual_gross_weight_kg or 0.0)
            customer_counts[key]["total_net_kg"] = round(
                customer_counts[key]["total_net_kg"] + net_wt, 2
            )
            customer_counts[key]["total_gross_kg"] = round(
                customer_counts[key]["total_gross_kg"] + gross_wt, 2
            )
            total_net += net_wt
            total_gross += gross_wt

        lines = [
            "=" * 60,
            "VEHICLE LOADING AND BOX DISPATCH CHECKLIST",
            f"Route: {route_code} | Shipment Target Date: {shipment_date}",
            "=" * 60,
            f"{'Customer Breakdown':<35} | {'Boxes':<10} | {'Box Range':<15}",
            "-" * 60,
        ]
        csv_rows = [
            "Customer Code,Company Name,Boxes Count,Total Net Weight (kg),Total Gross Weight (kg),Box Numbers"
        ]

        for _, data in sorted(customer_counts.items(), key=lambda item: item[0]):
            box_num_str = (
                f"#{min(data['box_numbers'])}-#{max(data['box_numbers'])}"
                if len(data["box_numbers"]) > 1
                else f"#{data['box_numbers'][0]}"
                if data["box_numbers"]
                else ""
            )
            summary_label = f"{data['customer_code']}: {data['boxes_count']} boxes"
            lines.append(
                f"{summary_label:<35} | {data['boxes_count']:>4} boxes | {box_num_str:<15}"
            )
            csv_rows.append(
                f'"{data["customer_code"]}","{data["company_name"]}",{data["boxes_count"]},{data["total_net_kg"]},{data["total_gross_kg"]},"{", ".join(map(str, data["box_numbers"]))}"'
            )

        lines.extend(
            [
                "-" * 60,
                f"TOTAL VEHICLE LOAD: {total_boxes} boxes | Gross Weight: {round(total_gross, 2)} kg | Net Weight: {round(total_net, 2)} kg",
                "=" * 60,
                "Verified by Floor Lead: ______________________ Date/Time: ____________",
            ]
        )

        return {
            "route_code": route_code,
            "shipment_date": shipment_date,
            "total_boxes_count": total_boxes,
            "total_gross_weight_kg": round(total_gross, 2),
            "total_net_weight_kg": round(total_net, 2),
            "customers": list(customer_counts.values()),
            "checklist_text": "\n".join(lines),
            "csv_content": "\n".join(csv_rows),
        }

    def fast_track_template_pack_order(
        self, client_order_id: str, actor: User
    ) -> dict[str, Any]:
        """
        Fast-Track Template Packing:
        Auto-generates packing manifest using template-specified weights and pack counts.
        Locks the boxes, creates the signed Handoff 02 contract, and transitions order to HANDOFF_02_RETURNED.
        """
        order = (
            self.db.query(ClientOrder)
            .filter(ClientOrder.id == client_order_id)
            .with_for_update()
            .first()
        )
        if not order:
            raise ValueError(f"ClientOrder {client_order_id} not found")

        # 1. Fetch or create boxes
        boxes = (
            self.db.query(Box)
            .filter(Box.client_order_id == client_order_id)
            .order_by(Box.box_number)
            .all()
        )
        if not boxes:
            # Create a standard box
            default_cat = (
                self.db.query(BoxCatalogue).filter(BoxCatalogue.is_active.is_(True)).first()
            )
            if not default_cat:
                raise ValueError("No active BoxCatalogue available in master data")

            ship_date = (
                order.raw_file.shipment_target_date if order.raw_file else "2026-09-07"
            )
            route = (
                order.customer.route_group
                if order.customer and order.customer.route_group
                else (order.raw_file.route_line if order.raw_file else "GENERAL")
            )
            box_uuid = str(uuid.uuid4())
            qr_uid = f"BOX-{route}-{ship_date.replace('-', '')}-001-{box_uuid[:8]}"
            box = Box(
                id=box_uuid,
                client_order_id=order.id,
                box_catalogue_id=default_cat.id,
                box_number=1,
                shipment_date=ship_date,
                route_code=route,
                qr_code_uid=qr_uid,
                is_locked=False,
            )
            self.db.add(box)
            self.db.flush()

            # Add all order items into box
            for ord_item in order.items:
                cnt = ord_item.confirmed_pack_count or ord_item.ordered_pack_count or 1
                wt = float(
                    ord_item.confirmed_net_weight_kg
                    or ord_item.estimated_net_weight_kg
                    or (cnt * 0.1)
                )
                box_item = BoxItem(
                    box_id=box.id,
                    product_id=ord_item.product_id,
                    pack_size=ord_item.pack_size or "std",
                    final_packed_count=cnt,
                    final_net_weight_kg=round(wt, 2),
                    adjustment_type=AdjustmentType.AS_ORDERED,
                )
                self.db.add(box_item)
            self.db.flush()
            boxes = [box]

        # 2. Lock and assign weights from items
        now = datetime.now(UTC)
        for b in boxes:
            net = round(sum(float(item.final_net_weight_kg) for item in b.items), 2)
            b.actual_net_weight_kg = net
            # Add standard tare (0.5 kg for box)
            b.actual_gross_weight_kg = round(net + 0.5, 2)
            cat = b.override_box_type or b.box_type
            cap = float(cat.max_safe_net_weight_kg) if cat else 15.0
            b.weight_utilization_pct = round((net / cap * 100), 2) if cap > 0 else 100.0
            b.packed_by_staff = actor.id
            b.is_locked = True
            b.locked_at = now

        # 3. Create Handoff 02 record
        ship_date = order.raw_file.shipment_target_date if order.raw_file else "2026-09-07"
        route = (
            order.customer.route_group
            if order.customer and order.customer.route_group
            else (order.raw_file.route_line if order.raw_file else "GENERAL")
        )
        handoff_id = str(uuid.uuid4())
        payload = {
            "handoff_id": handoff_id,
            "timestamp": now.isoformat(),
            "shipment_date": ship_date,
            "route_code": route,
            "final_packing_manifest_id": order.id,
            "packed_by_staff_id": actor.id,
            "locked_at": now.isoformat(),
            "total_boxes_count": len(boxes),
            "total_shipment_net_weight_kg": round(
                sum(float(b.actual_net_weight_kg) for b in boxes), 2
            ),
            "total_shipment_gross_weight_kg": round(
                sum(float(b.actual_gross_weight_kg) for b in boxes), 2
            ),
            "boxes": [
                {
                    "box_uuid": b.id,
                    "box_number": b.box_number,
                    "box_type_id": b.override_box_catalogue_id or b.box_catalogue_id,
                    "client_id": order.customer_id,
                    "order_ref_id": order.order_ref_id,
                    "actual_gross_weight_kg": float(b.actual_gross_weight_kg),
                    "actual_net_weight_kg": float(b.actual_net_weight_kg),
                    "rated_weight_kg": float((b.override_box_type or b.box_type).rated_weight_kg)
                    if (b.override_box_type or b.box_type)
                    else 10.0,
                    "qr_code_url": b.qr_image_url,
                    "items": [
                        {
                            "product_id": item.product_id,
                            "product_code": item.product.t_code if item.product else "",
                            "pack_size": item.pack_size,
                            "final_pack_count": item.final_packed_count,
                            "final_net_weight_kg": float(item.final_net_weight_kg),
                            "floor_adjustment_type": item.adjustment_type.value,
                        }
                        for item in b.items
                    ],
                }
                for b in boxes
            ],
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        sha = hashlib.sha256(encoded.encode("utf-8")).hexdigest()

        handoff = AgentHandoff(
            id=handoff_id,
            handoff_type="HANDOFF_02_FINAL_PACKING",
            sender_agent="AI_AGENT_2",
            recipient_agent="AI_AGENT_1",
            payload_json=payload,
            payload_sha256=sha,
        )
        self.db.add(handoff)

        order.status = OrderStatus.HANDOFF_02_RETURNED
        self.db.commit()

        return {
            "order_id": order.id,
            "order_ref_id": order.order_ref_id,
            "status": order.status.value,
            "boxes_count": len(boxes),
            "total_net_weight_kg": sum(float(b.actual_net_weight_kg) for b in boxes),
            "total_gross_weight_kg": sum(float(b.actual_gross_weight_kg) for b in boxes),
            "handoff_sha256": sha,
        }

    def fast_track_template_pack_group(
        self, group_name: str, shipment_date: str | None, actor: User
    ) -> dict[str, Any]:
        """
        Fast-tracks all client orders in a route group (e.g. GROUP CT, GROUP BE, or ALL).
        """
        clean_grp = group_name.strip()
        q = self.db.query(ClientOrder).join(Customer, ClientOrder.customer_id == Customer.id)
        if clean_grp.upper() != "ALL":
            q = q.filter(
                (Customer.route_group.ilike(f"%{clean_grp}%"))
                | (Customer.client_code.ilike(f"{clean_grp}-%"))
                | (Customer.client_code.ilike(f"{clean_grp}%"))
            )
        if shipment_date:
            q = q.join(RawOrderFile, ClientOrder.raw_order_file_id == RawOrderFile.id).filter(
                RawOrderFile.shipment_target_date == shipment_date
            )
        orders = q.all()
        results = []
        for o in orders:
            res = self.fast_track_template_pack_order(o.id, actor)
            results.append(res)

        return {
            "group_name": group_name,
            "orders_packed": len(results),
            "total_boxes": sum(r["boxes_count"] for r in results),
            "total_net_weight_kg": round(sum(r["total_net_weight_kg"] for r in results), 2),
            "orders": results,
        }
