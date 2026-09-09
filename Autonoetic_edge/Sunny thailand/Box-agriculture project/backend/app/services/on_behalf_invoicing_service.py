import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.invoice import Invoice, InvoiceLineItem, Receipt, InvoiceStatus, PaymentTransaction
from app.models.master_data import CustomerSellingPrice, PriceList
from app.models.order import ClientOrder, OrderStatus
from app.models.packing import Box

class OnBehalfInvoicingService:
    def __init__(self, db: Session):
        self.db = db

    def resolve_selling_price(
        self,
        main_customer_id: Optional[str],
        sub_customer_id: str,
        product_id: str,
        pack_size: str
    ) -> float:
        """
        Resolves selling price for On-Behalf Invoicing:
        1. Main Customer specific price for this Sub-Customer
        2. Main Customer general selling price for this SKU
        3. Global / Direct PriceList fallback
        """
        if main_customer_id:
            # 1. Main customer price specific to this sub-customer
            specific = self.db.query(CustomerSellingPrice).filter(
                CustomerSellingPrice.main_customer_id == main_customer_id,
                CustomerSellingPrice.sub_customer_id == sub_customer_id,
                CustomerSellingPrice.product_id == product_id,
                CustomerSellingPrice.pack_size == pack_size
            ).first()
            if specific:
                return float(specific.selling_price_eur)

            # 2. Main customer default price for all their sub-customers
            general = self.db.query(CustomerSellingPrice).filter(
                CustomerSellingPrice.main_customer_id == main_customer_id,
                CustomerSellingPrice.sub_customer_id.is_(None),
                CustomerSellingPrice.product_id == product_id,
                CustomerSellingPrice.pack_size == pack_size
            ).first()
            if general:
                return float(general.selling_price_eur)

        # 3. Fallback to PriceList
        price_entry = self.db.query(PriceList).filter(
            PriceList.product_id == product_id,
            PriceList.pack_size == pack_size
        ).first()
        if price_entry:
            return float(price_entry.unit_price_eur)

        return 2.50 # Standard export default EUR

    def generate_sub_customer_invoice(
        self,
        client_order_id: str,
        internal_notes: Optional[str] = None
    ) -> Invoice:
        """
        Generates a commercial invoice for a sub-customer on behalf of the main customer.
        Strictly adheres to Invariant 1: Billing lines are derived strictly from locked Final Packing scale weights.
        """
        order = self.db.query(ClientOrder).filter(ClientOrder.id == client_order_id).first()
        if not order:
            raise ValueError(f"ClientOrder {client_order_id} not found")

        if order.status not in {
            OrderStatus.FINAL_PACK_LOCKED,
            OrderStatus.HANDOFF_02_RETURNED,
            OrderStatus.INVOICES_DRAFTED,
        }:
            raise ValueError(
                f"Order {client_order_id} does not have locked final packing"
            )

        # Invariant 1: every packing record must be locked before it can be billed.
        boxes = self.db.query(Box).filter(Box.client_order_id == client_order_id).all()
        if not boxes:
            raise ValueError(f"No packing records found for order {client_order_id}")
        if any(not box.is_locked for box in boxes):
            raise ValueError(
                f"Order {client_order_id} does not have locked final packing"
            )

        main_customer_id = order.main_customer_id
        sub_customer_id = order.customer_id
        date_str = order.raw_file.shipment_target_date.replace("-", "") if order.raw_file else "20260707"
        inv_number = f"INV-{date_str}-{order.customer.client_code}"

        # Check existing invoice
        existing_inv = self.db.query(Invoice).filter(Invoice.invoice_number == inv_number).first()
        if existing_inv:
            invoice = existing_inv
            self.db.query(InvoiceLineItem).filter(InvoiceLineItem.invoice_id == invoice.id).delete()
        else:
            invoice = Invoice(
                invoice_number=inv_number,
                client_order_id=order.id,
                customer_id=sub_customer_id,
                seller_customer_id=main_customer_id,
                invoice_type="ON_BEHALF_SUB_CUSTOMER",
                final_packing_manifest_id=str(uuid.uuid4()), # Cryptographic token
                subtotal_eur=0.00,
                total_amount_eur=0.00,
                internal_notes=internal_notes,
                status=InvoiceStatus.INVOICE_DRAFT
            )
            self.db.add(invoice)
            self.db.flush()

        subtotal = 0.0

        for b in boxes:
            for it in b.items:
                selling_price = self.resolve_selling_price(
                    main_customer_id=main_customer_id,
                    sub_customer_id=sub_customer_id,
                    product_id=it.product_id,
                    pack_size=it.pack_size
                )
                line_total = round(it.final_packed_count * selling_price, 2)
                subtotal += line_total

                line_item = InvoiceLineItem(
                    invoice_id=invoice.id,
                    product_id=it.product_id,
                    box_number=b.box_number,
                    pack_size=it.pack_size,
                    billed_pack_count=it.final_packed_count,
                    billed_weight_kg=it.final_net_weight_kg, # Strictly verified scale weight
                    unit_price_eur=selling_price,
                    line_total_eur=line_total
                )
                self.db.add(line_item)

        invoice.subtotal_eur = round(subtotal, 2)
        invoice.total_amount_eur = round(subtotal, 2)
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def record_payment_and_issue_receipt(
        self,
        invoice_id: str,
        amount_paid: float,
        payment_date: str,
        bank_name: str,
        bank_wire_reference: str,
        internal_notes: Optional[str] = None,
        recorded_by_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Manually approves payment and records rolling balance.
        If invoice is fully paid, triggers official Receipt generation.
        Maintains private internal notes strictly for business owners.
        """
        invoice = self.db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")

        total_due = float(invoice.total_amount_eur)
        current_paid = float(invoice.amount_paid_eur or 0.0)
        new_total_paid = round(current_paid + amount_paid, 2)
        rolling_balance = max(0.0, round(total_due - new_total_paid, 2))

        # Record payment transaction sub-ledger
        tx = PaymentTransaction(
            invoice_id=invoice.id,
            amount_paid_eur=round(amount_paid, 2),
            payment_date=payment_date,
            bank_name=bank_name,
            bank_wire_reference=bank_wire_reference,
            rolling_balance_remaining_eur=rolling_balance,
            internal_notes=internal_notes,
            recorded_by=recorded_by_user_id
        )
        self.db.add(tx)

        invoice.amount_paid_eur = new_total_paid
        invoice.bank_wire_reference = bank_wire_reference
        invoice.payment_cleared_by = recorded_by_user_id
        invoice.payment_cleared_at = datetime.now(timezone.utc)

        receipt = None
        if rolling_balance <= 0.00:
            invoice.status = InvoiceStatus.CONFIRMED_PAID
            # Trigger official receipt generation
            receipt_no = f"RCP-{payment_date.replace('-', '')}-{invoice.invoice_number.split('-')[-1]}"
            receipt = self.db.query(Receipt).filter(Receipt.invoice_id == invoice.id).first()
            if not receipt:
                receipt = Receipt(
                    receipt_number=receipt_no,
                    invoice_id=invoice.id,
                    customer_id=invoice.customer_id,
                    amount_received_eur=new_total_paid,
                    bank_reference=bank_wire_reference,
                    receipt_pdf_url=f"https://storage.agricultureislife.com/receipts/{receipt_no}.pdf",
                    internal_notes=internal_notes,
                    issued_by_agent="AI_AGENT_1"
                )
                self.db.add(receipt)
            else:
                receipt.amount_received_eur = new_total_paid
                receipt.internal_notes = internal_notes
        else:
            invoice.status = InvoiceStatus.PARTIALLY_PAID

        self.db.commit()
        return {
            "invoice_number": invoice.invoice_number,
            "total_due_eur": total_due,
            "amount_paid_this_tx": amount_paid,
            "total_amount_paid_eur": new_total_paid,
            "rolling_balance_remaining_eur": rolling_balance,
            "status": invoice.status.value,
            "receipt_issued": receipt is not None,
            "receipt_number": receipt.receipt_number if receipt else None,
            "internal_notes": internal_notes
        }
