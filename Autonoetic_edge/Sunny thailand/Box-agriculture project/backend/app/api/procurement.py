from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.procurement import PurchasingItem
from app.models.order import RawOrderFile
from app.services.purchasing_aggregator import PurchasingAggregator
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.modules.procurement.service import ProcurementConfirmation, ProcurementConfirmationService

router = APIRouter(
    prefix="/procurement",
    tags=["Stage 01: Master Purchasing List"],
    dependencies=[Depends(get_current_user)],
)

class PurchasingItemOut(BaseModel):
    item_id: str
    product_id: str
    product_code: str
    product_name: str
    pack_size: str
    ordered_weight_kg: float
    buffer_percentage: float
    buffer_weight_kg: float
    required_packs: int
    required_weight_kg: float

class MasterPurchasingResponse(BaseModel):
    batch_reference: str
    total_skus: int
    total_ordered_weight_kg: float
    total_buffer_weight_kg: float
    total_required_weight_kg: float
    items: List[PurchasingItemOut]

class CombineOrdersRequest(BaseModel):
    raw_file_ids: List[str]
    client_order_ids: Optional[List[str]] = None
    batch_reference: Optional[str] = None
    shipment_date: Optional[str] = None
    route_code: Optional[str] = None

class BufferUpdateRequest(BaseModel):
    buffer_percentage: float
    save_as_default: bool = True

class ProcurementItemConfirmationRequest(BaseModel):
    item_id: str
    purchased_pack_count: int
    purchased_weight_kg: float
    shortage_reason: Optional[str] = None
    replacement_product_id: Optional[str] = None

class ProcurementBatchConfirmationRequest(BaseModel):
    items: List[ProcurementItemConfirmationRequest]

@router.put("/batches/{batch_id}/confirm")
def confirm_procurement_batch(
    batch_id: str,
    payload: ProcurementBatchConfirmationRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(
        UserRole.PROCUREMENT_BUYER,
        UserRole.OPERATIONS_MANAGER,
        UserRole.SYSTEM_ADMIN,
    )),
):
    try:
        batch = ProcurementConfirmationService(db).confirm_batch(
            batch_id=batch_id,
            confirmations=[
                ProcurementConfirmation(
                    item_id=item.item_id,
                    purchased_pack_count=item.purchased_pack_count,
                    purchased_weight_kg=item.purchased_weight_kg,
                    shortage_reason=item.shortage_reason,
                    replacement_product_id=item.replacement_product_id,
                )
                for item in payload.items
            ],
            actor=actor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "batch_id": batch.id,
        "batch_reference": batch.batch_reference,
        "status": batch.status.value,
        "confirmed_by": batch.confirmed_by_buyer,
        "confirmed_at": batch.confirmed_at,
    }

@router.post("/{raw_file_id}/consolidate", response_model=MasterPurchasingResponse)
def consolidate_purchasing_list(raw_file_id: str, db: Session = Depends(get_db)):
    raw_file = db.query(RawOrderFile).filter(RawOrderFile.id == raw_file_id).first()
    if not raw_file:
        raise HTTPException(status_code=404, detail="Raw order file not found")

    aggregator = PurchasingAggregator(db)
    mpl = aggregator.consolidate_demand(raw_file.id)

    items = db.query(PurchasingItem).filter(PurchasingItem.purchasing_list_id == mpl.id).all()
    tot_ordered = sum(float(it.ordered_net_weight_kg or 0.0) for it in items)
    tot_buffer = sum(float(it.buffer_weight_kg or 0.0) for it in items)
    tot_required = sum(float(it.total_required_weight_kg or 0.0) for it in items)

    items_out = [
        PurchasingItemOut(
            item_id=it.id,
            product_id=it.product_id,
            product_code=it.product.t_code if it.product else "",
            product_name=f"{it.product.name_vi} / {it.product.name_en}" if it.product else "",
            pack_size=it.pack_size,
            ordered_weight_kg=float(it.ordered_net_weight_kg or 0.0),
            buffer_percentage=float(it.buffer_percentage or 0.0),
            buffer_weight_kg=float(it.buffer_weight_kg or 0.0),
            required_packs=it.total_required_pack_count,
            required_weight_kg=float(it.total_required_weight_kg)
        )
        for it in items
    ]

    return MasterPurchasingResponse(
        batch_reference=mpl.batch_reference,
        total_skus=mpl.total_skus_count,
        total_ordered_weight_kg=round(tot_ordered, 2),
        total_buffer_weight_kg=round(tot_buffer, 2),
        total_required_weight_kg=round(tot_required, 2),
        items=items_out
    )

@router.post("/combine-and-consolidate", response_model=MasterPurchasingResponse)
def combine_orders_for_procurement(payload: CombineOrdersRequest, db: Session = Depends(get_db)):
    """
    Master Purchase Generation: Manual merge tool allowing staff to combine
    different main customer orders or order files for streamlined bulk purchasing.
    """
    aggregator = PurchasingAggregator(db)
    mpl = aggregator.combine_and_consolidate(
        raw_file_ids=payload.raw_file_ids,
        client_order_ids=payload.client_order_ids,
        batch_ref=payload.batch_reference,
        shipment_date=payload.shipment_date,
        route_code=payload.route_code
    )

    items = db.query(PurchasingItem).filter(PurchasingItem.purchasing_list_id == mpl.id).all()
    tot_ordered = sum(float(it.ordered_net_weight_kg or 0.0) for it in items)
    tot_buffer = sum(float(it.buffer_weight_kg or 0.0) for it in items)
    tot_required = sum(float(it.total_required_weight_kg or 0.0) for it in items)

    items_out = [
        PurchasingItemOut(
            item_id=it.id,
            product_id=it.product_id,
            product_code=it.product.t_code if it.product else "",
            product_name=f"{it.product.name_vi} / {it.product.name_en}" if it.product else "",
            pack_size=it.pack_size,
            ordered_weight_kg=float(it.ordered_net_weight_kg or 0.0),
            buffer_percentage=float(it.buffer_percentage or 0.0),
            buffer_weight_kg=float(it.buffer_weight_kg or 0.0),
            required_packs=it.total_required_pack_count,
            required_weight_kg=float(it.total_required_weight_kg)
        )
        for it in items
    ]

    return MasterPurchasingResponse(
        batch_reference=mpl.batch_reference,
        total_skus=mpl.total_skus_count,
        total_ordered_weight_kg=round(tot_ordered, 2),
        total_buffer_weight_kg=round(tot_buffer, 2),
        total_required_weight_kg=round(tot_required, 2),
        items=items_out
    )

@router.put("/items/{item_id}/buffer")
def adjust_purchasing_buffer(
    item_id: str,
    payload: BufferUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Buffer Addition:
    Staff manually inputs a yield or buffer percentage for products,
    which the system remembers and defaults to for future identical orders.
    """
    item = db.query(PurchasingItem).filter(PurchasingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="PurchasingItem not found")

    aggregator = PurchasingAggregator(db)
    result = aggregator.update_product_buffer(
        product_id=item.product_id,
        new_buffer_pct=payload.buffer_percentage,
        purchasing_item_id=item.id,
        save_as_default=payload.save_as_default
    )
    return {
        "message": "Buffer updated successfully and remembered as default",
        "details": result
    }
