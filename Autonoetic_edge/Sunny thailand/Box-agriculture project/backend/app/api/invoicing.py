from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.invoice import Invoice, Receipt
from app.models.user import User, UserRole
from app.services.on_behalf_invoicing_service import OnBehalfInvoicingService

router = APIRouter(
    prefix="/invoicing",
    tags=["Stage 03: Order-to-Cash Settlement"],
    dependencies=[Depends(get_current_user)],
)

class GenerateOnBehalfRequest(BaseModel):
    client_order_id: str
    internal_notes: str | None = None

class RecordPaymentRequest(BaseModel):
    amount_paid: float
    payment_date: str # 'YYYY-MM-DD'
    bank_name: str
    bank_wire_reference: str
    payment_mode: Literal["BANK_TRANSFER", "CREDIT_LETTER", "CASH"] = "BANK_TRANSFER"
    internal_notes: str | None = None

class InternalNotesUpdateRequest(BaseModel):
    internal_notes: str

class InvoiceLineItemOut(BaseModel):
    product_code: str
    product_name: str
    box_number: int
    pack_size: str
    billed_packs: int
    billed_weight_kg: float
    unit_price_eur: float
    line_total_eur: float

class InvoiceDetailOut(BaseModel):
    invoice_id: str
    invoice_number: str
    invoice_type: str
    main_customer_seller: str
    sub_customer_buyer: str
    subtotal_eur: float
    total_amount_eur: float
    amount_paid_eur: float
    status: str
    internal_notes: str | None = None # Visible to staff
    items: list[InvoiceLineItemOut]

@router.post("/generate-on-behalf", response_model=InvoiceDetailOut)
def generate_on_behalf_invoice(
    payload: GenerateOnBehalfRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.AI_AGENT_1)),
):
    """
    On-Behalf Invoicing:
    Generates invoices on behalf of the main customer, automatically substituting
    base costs with the main customer's designated selling prices for their sub-customers.
    Strictly derives line items from locked physical final packing scale weights.
    """
    service = OnBehalfInvoicingService(db)
    try:
        invoice = service.generate_sub_customer_invoice(
            client_order_id=payload.client_order_id,
            internal_notes=payload.internal_notes,
            actor=actor,
        )

        return _invoice_detail(invoice)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{invoice_id}/approve-dispatch", response_model=InvoiceDetailOut)
def approve_and_dispatch_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.ACCOUNTING_OFFICER, UserRole.SYSTEM_ADMIN)
    ),
):
    try:
        invoice = OnBehalfInvoicingService(db).approve_and_dispatch(
            invoice_id=invoice_id,
            actor=actor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _invoice_detail(invoice)

@router.post("/{invoice_id}/record-payment")
def record_payment_and_generate_receipt(
    invoice_id: str,
    payload: RecordPaymentRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.ACCOUNTING_OFFICER, UserRole.SYSTEM_ADMIN)
    ),
):
    """
    Financial Processing:
    Staff manually approves payments to trigger receipt generation.
    Maintains private internal notes for administrators to privately track
    rolling balances and specific bank payment dates.
    """
    service = OnBehalfInvoicingService(db)
    try:
        result = service.record_payment_and_issue_receipt(
            invoice_id=invoice_id,
            amount_paid=payload.amount_paid,
            payment_date=payload.payment_date,
            bank_name=payload.bank_name,
            bank_wire_reference=payload.bank_wire_reference,
            payment_mode=payload.payment_mode,
            internal_notes=payload.internal_notes,
            actor=actor,
        )
        return {
            "message": "Payment recorded successfully",
            "payment_details": result
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.put("/{invoice_id}/internal-notes")
def update_invoice_internal_notes(
    invoice_id: str,
    payload: InternalNotesUpdateRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.ACCOUNTING_OFFICER, UserRole.SYSTEM_ADMIN)
    ),
):
    """
    Internal Notes:
    Private text field for administrators to privately track notes on invoices.
    Never exposed on client-facing export documents.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice.internal_notes = payload.internal_notes
    db.commit()
    return {
        "message": "Internal notes updated successfully",
        "invoice_number": invoice.invoice_number,
        "internal_notes": invoice.internal_notes
    }

@router.get("/{invoice_id}", response_model=InvoiceDetailOut)
def get_invoice_detail(
    invoice_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.ACCOUNTING_OFFICER, UserRole.SYSTEM_ADMIN)
    ),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return _invoice_detail(invoice)


@router.get("/{invoice_id}/receipt")
def get_receipt(
    invoice_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(
        require_roles(UserRole.ACCOUNTING_OFFICER, UserRole.SYSTEM_ADMIN)
    ),
):
    receipt = db.query(Receipt).filter(Receipt.invoice_id == invoice_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return {
        "receipt_id": receipt.id,
        "receipt_number": receipt.receipt_number,
        "invoice_id": receipt.invoice_id,
        "customer_id": receipt.customer_id,
        "amount_received_eur": float(receipt.amount_received_eur),
        "bank_reference": receipt.bank_reference,
        "payload_sha256": receipt.payload_sha256,
        "issued_at": receipt.issued_at,
    }


def _invoice_detail(invoice: Invoice) -> InvoiceDetailOut:
    seller_name = (
        invoice.seller_customer.company_name if invoice.seller_customer else "Main Customer"
    )
    buyer_name = invoice.customer.company_name if invoice.customer else "Sub-Customer"
    item_list = [
        InvoiceLineItemOut(
            product_code=item.product.t_code if item.product else "",
            product_name=f"{item.product.name_vi} / {item.product.name_en}" if item.product else "",
            box_number=item.box_number,
            pack_size=item.pack_size,
            billed_packs=item.billed_pack_count,
            billed_weight_kg=float(item.billed_weight_kg),
            unit_price_eur=float(item.unit_price_eur),
            line_total_eur=float(item.line_total_eur)
        )
        for item in invoice.items
    ]

    return InvoiceDetailOut(
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_type=invoice.invoice_type,
        main_customer_seller=seller_name,
        sub_customer_buyer=buyer_name,
        subtotal_eur=float(invoice.subtotal_eur),
        total_amount_eur=float(invoice.total_amount_eur),
        amount_paid_eur=float(invoice.amount_paid_eur or 0.0),
        status=invoice.status.value,
        internal_notes=invoice.internal_notes,
        items=item_list
    )
