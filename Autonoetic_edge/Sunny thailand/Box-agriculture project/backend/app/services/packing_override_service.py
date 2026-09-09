import uuid
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.packing import Box, BoxItem, AdjustmentType, TransportationManifest
from app.models.master_data import BoxCatalogue
from app.models.order import ClientOrder

def compute_volumetric_weight(length_cm: float, width_cm: float, height_cm: float) -> float:
    """IATA standard air freight volumetric weight: (L * W * H in cm) / 6000"""
    return round((length_cm * width_cm * height_cm) / 6000.0, 2)

def compute_cbm(length_cm: float, width_cm: float, height_cm: float) -> float:
    """Cubic meters: (L * W * H) / 1,000,000"""
    return round((length_cm * width_cm * height_cm) / 1000000.0, 4)

class PackingOverrideService:
    def __init__(self, db: Session):
        self.db = db

    def override_box_size(
        self,
        box_id: str,
        new_catalogue_id: Optional[str] = None,
        custom_length_cm: Optional[float] = None,
        custom_width_cm: Optional[float] = None,
        custom_height_cm: Optional[float] = None,
        override_reason: Optional[str] = None
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
            catalogue = self.db.query(BoxCatalogue).filter(BoxCatalogue.id == new_catalogue_id).first()
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
        is_mixed_box: bool = True
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
        vol_wt = compute_volumetric_weight(float(cat.length_cm), float(cat.width_cm), float(cat.height_cm))

        new_box = Box(
            id=box_uuid,
            client_order_id=client_order_id,
            box_catalogue_id=cat.id,
            box_number=max_no + 1,
            shipment_date=shipment_date,
            route_code=route_code,
            is_mixed_box=is_mixed_box,
            qr_code_uid=f"BOX-{route_code}-{shipment_date.replace('-', '')}-{max_no + 1:03d}-{box_uuid[:8]}",
            qr_image_url=f"https://app.agricultureislife.com/scan/{box_uuid}",
            volumetric_weight_kg=vol_wt,
            chargeable_weight_kg=vol_wt,
            is_locked=False
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
        net_weight_kg: float
    ) -> Dict[str, Any]:
        """Allows packers to reallocate produce items between boxes."""
        source_box = self.db.query(Box).filter(Box.id == source_box_id).first()
        target_box = self.db.query(Box).filter(Box.id == target_box_id).first()
        if not source_box or not target_box:
            raise ValueError("Source or target box not found")
        if source_box.is_locked or target_box.is_locked:
            raise ValueError("Cannot move items on locked boxes")

        source_item = self.db.query(BoxItem).filter(
            BoxItem.box_id == source_box_id,
            BoxItem.product_id == product_id,
            BoxItem.pack_size == pack_size
        ).first()

        if not source_item or source_item.final_packed_count < quantity_to_move:
            raise ValueError("Insufficient quantity in source box to move")

        # Reduce from source
        source_item.final_packed_count -= quantity_to_move
        source_item.final_net_weight_kg = max(0.0, round(float(source_item.final_net_weight_kg) - net_weight_kg, 2))
        source_item.adjustment_type = AdjustmentType.SHORTAGE_REDUCED
        source_item.adjustment_notes = f"Moved {quantity_to_move} packs to Box #{target_box.box_number}"

        if source_item.final_packed_count == 0:
            self.db.delete(source_item)

        # Add to target
        target_item = self.db.query(BoxItem).filter(
            BoxItem.box_id == target_box_id,
            BoxItem.product_id == product_id,
            BoxItem.pack_size == pack_size
        ).first()

        if target_item:
            target_item.final_packed_count += quantity_to_move
            target_item.final_net_weight_kg = round(float(target_item.final_net_weight_kg) + net_weight_kg, 2)
            target_item.adjustment_type = AdjustmentType.QUANTITY_INCREASED
            target_item.adjustment_notes = f"Received {quantity_to_move} packs from Box #{source_box.box_number}"
        else:
            target_item = BoxItem(
                box_id=target_box_id,
                product_id=product_id,
                pack_size=pack_size,
                final_packed_count=quantity_to_move,
                final_net_weight_kg=round(net_weight_kg, 2),
                adjustment_type=AdjustmentType.QUANTITY_INCREASED,
                adjustment_notes=f"Received {quantity_to_move} packs from Box #{source_box.box_number}"
            )
            self.db.add(target_item)

        self.db.commit()
        return {
            "source_box_id": source_box_id,
            "target_box_id": target_box_id,
            "moved_packs": quantity_to_move,
            "moved_net_kg": net_weight_kg
        }

    def sync_transportation_manifest(
        self,
        route_code: str,
        shipment_date: str,
        flight_carrier: Optional[str] = "Thai Airways / TG930"
    ) -> TransportationManifest:
        """
        Automatically syncs finalized packing lists to generate accurate
        transportation manifests / freight invoices for shipping container management.
        """
        ref = f"TRN-{shipment_date.replace('-', '')}-{route_code}"
        manifest = self.db.query(TransportationManifest).filter(
            TransportationManifest.manifest_reference == ref
        ).first()

        boxes = self.db.query(Box).filter(
            Box.route_code == route_code,
            Box.shipment_date == shipment_date
        ).all()

        total_boxes = len(boxes)
        total_gross = 0.0
        total_net = 0.0
        total_vol = 0.0
        total_cbm = 0.0

        for b in boxes:
            total_gross += float(b.actual_gross_weight_kg or 0.0)
            total_net += float(b.actual_net_weight_kg or 0.0)

            # Determine dimensions
            if b.custom_length_cm and b.custom_width_cm and b.custom_height_cm:
                l, w, h = float(b.custom_length_cm), float(b.custom_width_cm), float(b.custom_height_cm)
            elif b.override_box_type:
                l, w, h = float(b.override_box_type.length_cm), float(b.override_box_type.width_cm), float(b.override_box_type.height_cm)
            elif b.box_type:
                l, w, h = float(b.box_type.length_cm), float(b.box_type.width_cm), float(b.box_type.height_cm)
            else:
                l, w, h = 38.0, 32.0, 18.0

            vol = compute_volumetric_weight(l, w, h)
            cbm = compute_cbm(l, w, h)
            total_vol += vol
            total_cbm += cbm

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
                total_cbm=round(total_cbm, 4),
                status="LOCKED"
            )
            self.db.add(manifest)
        else:
            manifest.flight_carrier = flight_carrier
            manifest.total_boxes_count = total_boxes
            manifest.total_gross_weight_kg = round(total_gross, 2)
            manifest.total_net_weight_kg = round(total_net, 2)
            manifest.total_volumetric_weight_kg = round(total_vol, 2)
            manifest.total_chargeable_weight_kg = round(chargeable, 2)
            manifest.total_cbm = round(total_cbm, 4)
            manifest.status = "LOCKED"

        self.db.commit()
        self.db.refresh(manifest)
        return manifest

