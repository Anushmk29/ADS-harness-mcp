from app.models.audit import AgentHandoff, AuditLog
from app.models.master_data import (
    BoxMaterial,
    ControlStatus,
    Customer,
    ProduceType,
    Product,
    TemperatureZone,
    WeightClass,
)
from app.models.order import ClientOrder, ClientOrderItem, OrderStatus, RawOrderFile
from app.models.procurement import MasterPurchasingList, PurchasingItem, PurchasingOrderSource
from app.models.user import User, UserRole
from app.modules.handoffs.service import HandoffService
from app.modules.procurement.service import ProcurementConfirmation, ProcurementConfirmationService


def setup_procurement_batch(db_session):
    buyer = User(
        email="buyer@example.com",
        password_hash="unused",
        full_name="Market Buyer",
        role=UserRole.PROCUREMENT_BUYER,
    )
    agent = User(
        email="agent1@example.com",
        password_hash="unused",
        full_name="Agent One",
        role=UserRole.AI_AGENT_1,
        is_service_principal=True,
    )
    customer = Customer(
        client_code="BUYER-1",
        company_name="Buyer One",
        billing_email="buyer1@example.com",
        route_group="TETE",
        destination_country="France",
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
    db_session.add_all([buyer, agent, customer, product])
    db_session.flush()
    raw_file = RawOrderFile(
        file_name="order.xlsx",
        storage_url="order.xlsx",
        shipment_target_date="2026-09-10",
        route_line="TETE",
        uploaded_by=agent.id,
        status=OrderStatus.PURCHASING_CONSOLIDATED,
    )
    db_session.add(raw_file)
    db_session.flush()
    order = ClientOrder(
        raw_order_file_id=raw_file.id,
        customer_id=customer.id,
        order_ref_id="ORD-20260910-BUYER1",
        total_ordered_items_count=10,
        total_estimated_net_weight_kg=10,
        status=OrderStatus.PURCHASING_CONSOLIDATED,
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        ClientOrderItem(
            client_order_id=order.id,
            product_id=product.id,
            raw_produce_text="T001 - Herb",
            pack_size="1kg",
            ordered_pack_count=10,
            estimated_net_weight_kg=10,
        )
    )
    batch = MasterPurchasingList(
        raw_order_file_id=raw_file.id,
        batch_reference="PUR-20260910-1",
        shipment_date="2026-09-10",
        route_code="TETE",
        total_skus_count=1,
        status=OrderStatus.PURCHASING_CONSOLIDATED,
    )
    db_session.add(batch)
    db_session.flush()
    source = PurchasingOrderSource(
        purchasing_list_id=batch.id,
        raw_order_file_id=raw_file.id,
    )
    item = PurchasingItem(
        purchasing_list_id=batch.id,
        product_id=product.id,
        pack_size="1kg",
        ordered_net_weight_kg=10,
        total_required_pack_count=11,
        total_required_weight_kg=11,
    )
    db_session.add_all([source, item])
    db_session.commit()
    return buyer, agent, order, batch, item


def test_procurement_confirmation_is_audited_human_gate(db_session):
    buyer, _, order, batch, item = setup_procurement_batch(db_session)

    ProcurementConfirmationService(db_session).confirm_batch(
        batch_id=batch.id,
        confirmations=[
            ProcurementConfirmation(
                item_id=item.id,
                purchased_pack_count=8,
                purchased_weight_kg=8.0,
                shortage_reason="Market shortage",
            )
        ],
        actor=buyer,
    )

    assert batch.status == OrderStatus.PROCUREMENT_CONFIRMED
    assert order.status == OrderStatus.PROCUREMENT_CONFIRMED
    assert item.confirmed_purchased_pack_count == 8
    assert item.shortage_reason == "Market shortage"
    assert db_session.query(AuditLog).filter_by(event_type="PROCUREMENT_CONFIRMED").count() == 1


def test_handoff_01_is_canonical_hashed_and_advances_orders(db_session):
    buyer, agent, order, batch, item = setup_procurement_batch(db_session)
    ProcurementConfirmationService(db_session).confirm_batch(
        batch_id=batch.id,
        confirmations=[ProcurementConfirmation(item.id, 8, 8.0, "Market shortage")],
        actor=buyer,
    )

    handoff = HandoffService(db_session).dispatch_handoff_01(batch_id=batch.id, actor=agent)

    assert handoff.handoff_type == "HANDOFF_01_ORDER_DATA"
    assert len(handoff.payload_sha256) == 64
    assert handoff.payload_json["procurement_batch_id"] == batch.id
    assert handoff.payload_json["confirmed_orders"][0]["items"][0]["confirmed_pack_count"] == 8
    assert order.status == OrderStatus.HANDOFF_01_SENT
    assert db_session.query(AgentHandoff).count() == 1
