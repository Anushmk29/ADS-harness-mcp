import pytest

from app.models.invoice import Invoice
from app.models.master_data import (
    BoxCatalogue,
    BoxMaterial,
    ControlStatus,
    Customer,
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
        email="admin@example.com",
        password_hash="unused",
        full_name="Admin",
        role=UserRole.SYSTEM_ADMIN,
    )
    seller = Customer(
        client_code="TONIO",
        company_name="Tonio",
        billing_email="seller@example.com",
        route_group="TETE",
        destination_country="France",
        is_main_customer=True,
    )
    buyer = Customer(
        client_code="BUYER-1",
        company_name="Buyer",
        billing_email="buyer@example.com",
        route_group="TETE",
        destination_country="France",
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
        status=OrderStatus.FINAL_PACK_LOCKED if locked else OrderStatus.FLOOR_PACKING,
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
    db_session.commit()
    return order


def test_invoice_rejects_any_unlocked_packing_data(db_session):
    order = build_order_with_box(db_session, locked=False)

    with pytest.raises(ValueError, match="locked final packing"):
        OnBehalfInvoicingService(db_session).generate_sub_customer_invoice(order.id)

    assert db_session.query(Invoice).count() == 0


def test_invoice_uses_locked_final_packing_data(db_session):
    order = build_order_with_box(db_session, locked=True)

    invoice = OnBehalfInvoicingService(db_session).generate_sub_customer_invoice(order.id)

    assert len(invoice.items) == 1
    assert invoice.items[0].billed_pack_count == 2
    assert float(invoice.items[0].billed_weight_kg) == 2.0
