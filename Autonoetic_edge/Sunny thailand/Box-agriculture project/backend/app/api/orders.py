from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
import os
import uuid
import shutil
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.order import RawOrderFile, ClientOrder, ClientOrderItem, OrderStatus
from app.services.matrix_parser import MatrixOrderParser
from app.services.order_splitter import OrderSplitter
from app.core.dependencies import require_roles
from app.modules.orders.validation import OrderValidationService

router = APIRouter(prefix="/orders", tags=["Stage 01: Order Intake & Splitting"])

class OrderAcknowledgmentResponse(BaseModel):
    message: str
    raw_file_id: str
    file_name: str
    main_customer_id: Optional[str]
    total_sub_customers_detected: int
    sub_customer_codes: List[str]
    sheets_detected: List[dict]
    status: str
    verification_notice: str

class OrderSplitResponse(BaseModel):
    raw_file_id: str
    status: str
    total_client_orders_created: int
    total_line_items_created: int
    total_estimated_weight_kg: float
    sample_orders: List[dict]

@router.post("/upload-matrix", response_model=OrderAcknowledgmentResponse)
def upload_order_matrix(
    file: UploadFile = File(...),
    shipment_date: str = Form("2026-07-07"),
    route_line: str = Form("TETE"),
    main_customer_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(
        UserRole.CUSTOMER_AGENT,
        UserRole.OPERATIONS_MANAGER,
        UserRole.SYSTEM_ADMIN,
    )),
):
    """
    Intake & Acknowledgment:
    Main customer uploads an order matrix. The system immediately discovers and returns
    the total sub-customer count and sheet breakdown for instant human verification.
    """
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, f"{uuid.uuid4()}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Fast inspection to acknowledge sub-customers immediately
    parser = MatrixOrderParser(file_path)
    ack_info = parser.inspect_sub_customers()

    raw_file = RawOrderFile(
        file_name=file.filename,
        storage_url=file_path,
        shipment_target_date=shipment_date,
        route_line=route_line,
        uploaded_by=actor.id,
        main_customer_id=main_customer_id,
        detected_sub_customer_count=ack_info["total_sub_customers"],
        acknowledgment_summary=ack_info,
        status=OrderStatus.UPLOADED
    )
    db.add(raw_file)
    db.commit()
    db.refresh(raw_file)

    return OrderAcknowledgmentResponse(
        message="Order matrix uploaded and acknowledged successfully.",
        raw_file_id=raw_file.id,
        file_name=raw_file.file_name,
        main_customer_id=raw_file.main_customer_id,
        total_sub_customers_detected=ack_info["total_sub_customers"],
        sub_customer_codes=ack_info["sub_customer_codes"],
        sheets_detected=ack_info["sheets_processed"],
        status=raw_file.status.value,
        verification_notice=f"Found {ack_info['total_sub_customers']} sub-customers across {len(ack_info['sheets_processed'])} sheets. Please verify before confirming split."
    )

@router.get("/{raw_file_id}/validate")
def validate_order_matrix(
    raw_file_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(
        UserRole.AI_AGENT_1,
        UserRole.OPERATIONS_MANAGER,
        UserRole.SYSTEM_ADMIN,
    )),
):
    try:
        result = OrderValidationService(db).validate(raw_file_id=raw_file_id, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "raw_file_id": result.raw_file_id,
        "status": OrderStatus.PARSED.value,
        "sheets": result.sheets,
        "total_customers": result.total_customers,
        "total_product_rows": result.total_product_rows,
        "resolved_product_rows": result.resolved_product_rows,
        "unresolved": [issue.__dict__ for issue in result.unresolved],
        "can_split": result.can_split,
    }

@router.post("/{raw_file_id}/split", response_model=OrderSplitResponse)
def split_order_matrix(
    raw_file_id: str,
    main_customer_id: Optional[str] = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(
        UserRole.AI_AGENT_1,
        UserRole.OPERATIONS_MANAGER,
        UserRole.SYSTEM_ADMIN,
    )),
):
    """
    Splits the acknowledged order matrix into individual sub-customer orders,
    enforcing SKU standardization, deduplicating identical items, and linking to the parent main customer.
    """
    raw_file = db.query(RawOrderFile).filter(RawOrderFile.id == raw_file_id).first()
    if not raw_file:
        raise HTTPException(status_code=404, detail="Raw order file not found")
    validation = (raw_file.acknowledgment_summary or {}).get("validation", {})
    if raw_file.status != OrderStatus.PARSED or not validation.get("can_split"):
        raise HTTPException(
            status_code=409,
            detail="Matrix must be validated and all unresolved SKUs mapped before splitting",
        )

    parser = MatrixOrderParser(raw_file.storage_url)
    parsed_data = parser.parse_all_clients()

    splitter = OrderSplitter(db)
    client_orders = splitter.split_raw_order(
        raw_file_id=raw_file.id,
        parsed_data=parsed_data,
        main_customer_id=main_customer_id or raw_file.main_customer_id,
        actor=actor,
    )

    total_items = db.query(ClientOrderItem).join(ClientOrder).filter(ClientOrder.raw_order_file_id == raw_file.id).count()
    total_weight = sum(o.total_estimated_net_weight_kg for o in client_orders)

    samples = [
        {
            "order_ref_id": o.order_ref_id,
            "client_code": o.customer.client_code,
            "items_count": o.total_ordered_items_count,
            "estimated_net_weight_kg": float(o.total_estimated_net_weight_kg)
        }
        for o in client_orders[:5]
    ]

    return OrderSplitResponse(
        raw_file_id=raw_file.id,
        status=raw_file.status.value,
        total_client_orders_created=len(client_orders),
        total_line_items_created=total_items,
        total_estimated_weight_kg=round(float(total_weight), 2),
        sample_orders=samples
    )
