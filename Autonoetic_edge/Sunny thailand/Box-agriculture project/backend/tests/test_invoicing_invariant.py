import hashlib
import json

import pytest

from app.models.audit import AgentHandoff, AuditLog
from app.models.invoice import Invoice, InvoiceStatus, PaymentTransaction, Receipt
from app.models.master_data import (
    BoxCatalogue,
    BoxMaterial,
    ControlStatus,
    Customer,
    PriceList,
    ProduceType,
    Product,
    TemperatureZone,
    WeightClass,
)
from app.models.order import ClientOrder, OrderStatus, RawOrderFile
from app.models.packing import Box, BoxItem
from app.models.user import User, UserRole
from app.services.on_behalf_invoicing_service import OnBehalfInvoicingService


def build_order_with_box(db_session, *, locked: bool):
    user = User(
        email="agent1@example.com",
        password_hash="unused",
        full_name="Agent One",
        role=UserRole.AI_AGENT_1,
        is_service_principal=True,
    )
    seller = Customer(
        client_code="TONIO",
        company_name="Tonio",
        billing_email="seller@example.com",
        route_group="TETE",
        destination_country="France",
        tax_vat_id="FR-SELLER-001",
        is_main_customer=True,
    )
    buyer = Customer(
        client_code="BUYER-1",
        company_name="Buyer",
        billing_email="buyer@example.com",
        route_group="TETE",
        destination_country="France",
        tax_vat_id="FR-BUYER-001",
        parent_customer=seller,
    )
    product = Product(
        t_code="T001",
        name_vi="Rau",
        name_en="Herb",
        name_th="Pak",
        box_material=BoxMaterial.FOAM,
        temperature=TemperatureZone.COLD,
        control_status=ControlStatus.COMBINABLE,
        produce_type=ProduceType.HERB,
        weight_class=WeightClass.LIGHT,
        default_pack_sizes=["1kg"],
    )
    catalogue = BoxCatalogue(
        box_type=BoxMaterial.FOAM,
        size_name="Small",
        length_cm=40,
        width_cm=30,
        height_cm=20,
        rated_weight_kg=5,
        volume_m3=0.024,
        max_safe_net_weight_kg=5,
    )
    db_session.add_all([user, seller, buyer, product, catalogue])
    db_session.flush()
    db_session.add(
        PriceList(
            product_id=product.id,
            pack_size="1kg",
            unit_price_eur=2.5,
            valid_from="2026-01-01",
        )
    )
    raw_file = RawOrderFile(
        file_name="order.xlsx",
        storage_url="order.xlsx",
        shipment_target_date="2026-09-10",
        route_line="TETE",
        uploaded_by=user.id,
        main_customer_id=seller.id,
    )
    db_session.add(raw_file)
    db_session.flush()
    order = ClientOrder(
        raw_order_file_id=raw_file.id,
        customer_id=buyer.id,
        main_customer_id=seller.id,
        order_ref_id="ORD-20260910-BUYER1",
        status=OrderStatus.HANDOFF_02_RETURNED if locked else OrderStatus.FLOOR_PACKING,
    )
    db_session.add(order)
    db_session.flush()
    box = Box(
        client_order_id=order.id,
        box_catalogue_id=catalogue.id,
        box_number=1,
        shipment_date="2026-09-10",
        route_code="TETE",
        qr_code_uid="BOX-1",
        actual_gross_weight_kg=2.2,
        actual_net_weight_kg=2.0,
        is_locked=locked,
    )
    db_session.add(box)
    db_session.flush()
    db_session.add(
        BoxItem(
            box_id=box.id,
            product_id=product.id,
            pack_size="1kg",
            final_packed_count=2,
            final_net_weight_kg=2.0,
        )
    )
    if locked:
        payload = {"final_packing_manifest_id": order.id, "boxes": [box.id]}
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        db_session.add(
            AgentHandoff(
                handoff_type="HANDOFF_02_FINAL_PACKING",
                sender_agent="AI_AGENT_2",
                recipient_agent="AI_AGENT_1",
                payload_json=payload,
                payload_sha256=hashlib.sha256(encoded.encode("utf-8")).hexdigest(),
            )
        )
    db_session.commit()
    return order


def test_invoice_rejects_any_unlocked_packing_data(db_session):
    order = build_order_with_box(db_session, locked=False)
    actor = db_session.query(User).filter_by(email="agent1@example.com").one()

    with pytest.raises(ValueError, match="locked final packing"):
        OnBehalfInvoicingService(db_session).generate_sub_customer_invoice(
            order.id,
            actor=actor,
        )

    assert db_session.query(Invoice).count() == 0


def test_invoice_uses_locked_final_packing_data(db_session):
    order = build_order_with_box(db_session, locked=True)
    actor = db_session.query(User).filter_by(email="agent1@example.com").one()

    invoice = OnBehalfInvoicingService(db_session).generate_sub_customer_invoice(
        order.id,
        actor=actor,
    )

    assert len(invoice.items) == 1
    assert invoice.items[0].billed_pack_count == 2
    assert float(invoice.items[0].billed_weight_kg) == 2.0
    assert invoice.final_packing_manifest_id == db_session.query(AgentHandoff).one().payload_sha256
    assert order.status == OrderStatus.INVOICES_DRAFTED


def test_accounting_lifecycle_is_gated_audited_and_issues_receipt(db_session):
    order = build_order_with_box(db_session, locked=True)
    agent = db_session.query(User).filter_by(email="agent1@example.com").one()
    accounting = User(
        email="accounting@example.com",
        password_hash="unused",
        full_name="Accounting Officer",
        role=UserRole.ACCOUNTING_OFFICER,
    )
    db_session.add(accounting)
    db_session.commit()
    service = OnBehalfInvoicingService(db_session)

    invoice = service.generate_sub_customer_invoice(order.id, actor=agent)
    service.approve_and_dispatch(invoice_id=invoice.id, actor=accounting)
    partial = service.record_payment_and_issue_receipt(
        invoice_id=invoice.id,
        amount_paid=2.0,
        payment_date="2026-09-11",
        bank_name="Bangkok Bank",
        bank_wire_reference="WIRE-PARTIAL-1",
        payment_mode="BANK_TRANSFER",
        actor=accounting,
    )
    final = service.record_payment_and_issue_receipt(
        invoice_id=invoice.id,
        amount_paid=3.0,
        payment_date="2026-09-12",
        bank_name="Bangkok Bank",
        bank_wire_reference="WIRE-FINAL-1",
        payment_mode="BANK_TRANSFER",
        actor=accounting,
    )

    assert partial["status"] == InvoiceStatus.PARTIALLY_PAID.value
    assert partial["receipt_issued"] is False
    assert final["status"] == InvoiceStatus.CONFIRMED_PAID.value
    assert final["receipt_issued"] is True
    assert order.status == OrderStatus.RECEIPTS_ISSUED
    assert db_session.query(PaymentTransaction).count() == 2
    receipt = db_session.query(Receipt).one()
    assert len(receipt.payload_sha256) == 64
    receipt_event = db_session.query(AuditLog).filter_by(event_type="EVT_RECEIPT_ISSUED").one()
    assert receipt_event.actor_role == UserRole.AI_AGENT_1.value
    assert {
        "EVT_INVOICE_DRAFTED",
        "EVT_INVOICE_DISPATCH",
        "EVT_PAYMENT_CONFIRMED",
        "EVT_RECEIPT_ISSUED",
    }.issubset({event.event_type for event in db_session.query(AuditLog).all()})


def test_payment_requires_dispatched_invoice_and_accounting_role(db_session):
    order = build_order_with_box(db_session, locked=True)
    agent = db_session.query(User).filter_by(email="agent1@example.com").one()
    accounting = User(
        email="accounting@example.com",
        password_hash="unused",
        full_name="Accounting Officer",
        role=UserRole.ACCOUNTING_OFFICER,
    )
    floor_user = User(
        email="floor@example.com",
        password_hash="unused",
        full_name="Floor User",
        role=UserRole.FLOOR_STAFF,
    )
    db_session.add_all([accounting, floor_user])
    db_session.commit()
    service = OnBehalfInvoicingService(db_session)
    invoice = service.generate_sub_customer_invoice(order.id, actor=agent)

    with pytest.raises(ValueError, match="dispatched"):
        service.record_payment_and_issue_receipt(
            invoice_id=invoice.id,
            amount_paid=1.0,
            payment_date="2026-09-11",
            bank_name="Bangkok Bank",
            bank_wire_reference="WIRE-1",
            payment_mode="BANK_TRANSFER",
            actor=accounting,
        )

    with pytest.raises(PermissionError, match="Accounting"):
        service.approve_and_dispatch(invoice_id=invoice.id, actor=floor_user)


def test_invoice_rejects_tampered_handoff_02(db_session):
    order = build_order_with_box(db_session, locked=True)
    actor = db_session.query(User).filter_by(email="agent1@example.com").one()
    handoff = db_session.query(AgentHandoff).one()
    handoff.payload_json = {**handoff.payload_json, "boxes": ["tampered"]}
    db_session.commit()

    with pytest.raises(ValueError, match="integrity verification"):
        OnBehalfInvoicingService(db_session).generate_sub_customer_invoice(
            order.id,
            actor=actor,
        )
