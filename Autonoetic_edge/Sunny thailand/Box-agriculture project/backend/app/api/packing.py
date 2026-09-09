from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.packing import Box
from app.models.order import ClientOrder, OrderStatus
from app.services.packing_override_service import PackingOverrideService
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.modules.packing.service import FinalPackingService, PackingPlanningService

router = APIRouter(
    prefix="/packing",
    tags=["Stage 02: Physical Packing & Box Management"],
    dependencies=[Depends(get_current_user)],
)

class BoxOverrideRequest(BaseModel):
    new_catalogue_id: Optional[str] = None
    custom_length_cm: Optional[float] = None
    custom_width_cm: Optional[float] = None
    custom_height_cm: Optional[float] = None
    override_reason: Optional[str] = None

class AddBoxRequest(BaseModel):
    box_catalogue_id: str
    shipment_date: str
    route_code: str
    is_mixed_box: bool = True

class MoveItemsRequest(BaseModel):
    source_box_id: str
    target_box_id: str
    product_id: str
    pack_size: str
    quantity: int
    net_weight_kg: float

class PackingDesignRequest(BaseModel):
    order_id: str

@router.post("/solve-design")
def solve_packing_design(
    payload: PackingDesignRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.AI_AGENT_2, UserRole.SYSTEM_ADMIN)),
):
    try:
        boxes = PackingPlanningService(db).design_order(order_id=payload.order_id, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "order_id": payload.order_id,
        "status": OrderStatus.PACKING_DESIGNED.value,
        "boxes_created": len(boxes),
        "box_ids": [box.id for box in boxes],
    }

@router.post("/orders/{client_order_id}/start-floor-packing")
def start_floor_packing(
    client_order_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(
        UserRole.FLOOR_STAFF,
        UserRole.OPERATIONS_MANAGER,
        UserRole.SYSTEM_ADMIN,
    )),
):
    try:
        order = PackingPlanningService(db).start_floor_packing(order_id=client_order_id, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"order_id": order.id, "status": order.status.value}

@router.post("/orders/{client_order_id}/confirm-final-pack")
def confirm_final_pack(
    client_order_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(
        UserRole.OPERATIONS_MANAGER,
        UserRole.AI_AGENT_2,
    )),
):
    try:
        boxes = FinalPackingService(db).lock_order(order_id=client_order_id, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "order_id": client_order_id,
        "status": OrderStatus.FINAL_PACK_LOCKED.value,
        "locked_box_ids": [box.id for box in boxes],
    }

class BoxItemOut(BaseModel):
    product_id: str
    product_code: str
    produce_name: str
    pack_size: str
    packed_count: int
    net_weight_kg: float
    adjustment_type: str

class BoxDetailOut(BaseModel):
    box_id: str
    box_number: int
    box_type_name: str
    is_overridden: bool
    actual_gross_weight_kg: Optional[float]
    actual_net_weight_kg: Optional[float]
    volumetric_weight_kg: Optional[float]
    chargeable_weight_kg: Optional[float]
    is_locked: bool
    qr_code_uid: str
    items: List[BoxItemOut]

class SubCustomerPackingListOut(BaseModel):
    client_order_id: str
    order_ref_id: str
    sub_customer_code: str
    route_code: str
    total_boxes_count: int
    boxes: List[BoxDetailOut]

@router.get("/orders/{client_order_id}/packing-list", response_model=SubCustomerPackingListOut)
def get_sub_customer_packing_list(client_order_id: str, db: Session = Depends(get_db)):
    """
    Generates a specific packing list outlining items and box numbers per sub-customer.
    """
    order = db.query(ClientOrder).filter(ClientOrder.id == client_order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="ClientOrder not found")

    boxes = db.query(Box).filter(Box.client_order_id == client_order_id).order_by(Box.box_number).all()

    box_list = []
    for b in boxes:
        type_name = b.override_box_type.size_name if b.override_box_type else (b.box_type.size_name if b.box_type else "Custom")
        item_list = [
            BoxItemOut(
                product_id=it.product_id,
                product_code=it.product.t_code if it.product else "",
                produce_name=f"{it.product.name_vi} / {it.product.name_en}" if it.product else "",
                pack_size=it.pack_size,
                packed_count=it.final_packed_count,
                net_weight_kg=float(it.final_net_weight_kg),
                adjustment_type=it.adjustment_type.value
            )
            for it in b.items
        ]
        box_list.append(BoxDetailOut(
            box_id=b.id,
            box_number=b.box_number,
            box_type_name=type_name,
            is_overridden=b.is_manually_overridden,
            actual_gross_weight_kg=float(b.actual_gross_weight_kg) if b.actual_gross_weight_kg is not None else None,
            actual_net_weight_kg=float(b.actual_net_weight_kg) if b.actual_net_weight_kg is not None else None,
            volumetric_weight_kg=float(b.volumetric_weight_kg) if b.volumetric_weight_kg is not None else None,
            chargeable_weight_kg=float(b.chargeable_weight_kg) if b.chargeable_weight_kg is not None else None,
            is_locked=b.is_locked,
            qr_code_uid=b.qr_code_uid,
            items=item_list
        ))

    return SubCustomerPackingListOut(
        client_order_id=order.id,
        order_ref_id=order.order_ref_id,
        sub_customer_code=order.customer.client_code if order.customer else "",
        route_code=order.raw_file.route_line if order.raw_file else "TETE",
        total_boxes_count=len(boxes),
        boxes=box_list
    )

@router.put("/boxes/{box_id}/override-size")
def override_box_size(
    box_id: str,
    payload: BoxOverrideRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.FLOOR_STAFF, UserRole.OPERATIONS_MANAGER)),
):
    """
    Box Management: Floor staff manual override to adjust physical box dimensions or catalogue type
    if inventory differs from the initial plan.
    """
    service = PackingOverrideService(db)
    try:
        updated_box = service.override_box_size(
            box_id=box_id,
            new_catalogue_id=payload.new_catalogue_id,
            custom_length_cm=payload.custom_length_cm,
            custom_width_cm=payload.custom_width_cm,
            custom_height_cm=payload.custom_height_cm,
            override_reason=payload.override_reason
        )
        return {
            "message": "Box size overridden successfully",
            "box_id": updated_box.id,
            "box_number": updated_box.box_number,
            "volumetric_weight_kg": float(updated_box.volumetric_weight_kg or 0.0),
            "chargeable_weight_kg": float(updated_box.chargeable_weight_kg or 0.0),
            "is_overridden": updated_box.is_manually_overridden
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/orders/{client_order_id}/add-box")
def add_extra_box_to_order(
    client_order_id: str,
    payload: AddBoxRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.FLOOR_STAFF, UserRole.OPERATIONS_MANAGER)),
):
    """
    Box Management: Allows packers to add an extra box, adjusting total box count.
    """
    service = PackingOverrideService(db)
    try:
        new_box = service.add_extra_box_to_order(
            client_order_id=client_order_id,
            box_catalogue_id=payload.box_catalogue_id,
            shipment_date=payload.shipment_date,
            route_code=payload.route_code,
            is_mixed_box=payload.is_mixed_box
        )
        return {
            "message": "Extra box added successfully",
            "box_id": new_box.id,
            "box_number": new_box.box_number,
            "qr_code_uid": new_box.qr_code_uid,
            "volumetric_weight_kg": float(new_box.volumetric_weight_kg or 0.0)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/boxes/move-items")
def move_items_between_boxes(
    payload: MoveItemsRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.FLOOR_STAFF, UserRole.OPERATIONS_MANAGER)),
):
    """Allows packers to reallocate produce items between boxes on the floor."""
    service = PackingOverrideService(db)
    try:
        result = service.move_items_between_boxes(
            source_box_id=payload.source_box_id,
            target_box_id=payload.target_box_id,
            product_id=payload.product_id,
            pack_size=payload.pack_size,
            quantity_to_move=payload.quantity,
            net_weight_kg=payload.net_weight_kg
        )
        return {"message": "Items moved successfully", "details": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/manifests/sync")
def sync_transportation_manifest(
    route_code: str,
    shipment_date: str,
    flight_carrier: Optional[str] = "Thai Airways / TG930",
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.OPERATIONS_MANAGER, UserRole.AI_AGENT_2)),
):
    """
    Finalized packing list automatically syncs to generate accurate
    transportation manifests / freight invoices for container management.
    """
    service = PackingOverrideService(db)
    manifest = service.sync_transportation_manifest(
        route_code=route_code,
        shipment_date=shipment_date,
        flight_carrier=flight_carrier
    )
    return {
        "message": "Transportation manifest synced and locked successfully",
        "manifest_reference": manifest.manifest_reference,
        "total_boxes_count": manifest.total_boxes_count,
        "total_gross_weight_kg": float(manifest.total_gross_weight_kg),
        "total_volumetric_weight_kg": float(manifest.total_volumetric_weight_kg),
        "total_chargeable_weight_kg": float(manifest.total_chargeable_weight_kg),
        "total_cbm": float(manifest.total_cbm),
        "status": manifest.status
    }
