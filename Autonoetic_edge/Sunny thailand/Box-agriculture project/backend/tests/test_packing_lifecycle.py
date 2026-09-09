from app.models.audit import AgentHandoff
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
from app.models.order import ClientOrder, ClientOrderItem, OrderStatus, RawOrderFile
from app.models.packing import Box
from app.models.user import User, UserRole
from app.modules.handoffs.service import HandoffService
from app.modules.packing.service import FinalPackingService, PackingPlanningService


def setup_order(db_session):
    agent = User(
        email="agent2@example.com",
        password_hash="unused",
        full_name="Agent Two",
        role=UserRole.AI_AGENT_2,
        is_service_principal=True,
    )
    packer = User(
        email="packer@example.com",
        password_hash="unused",
        full_name="Floor Packer",
        role=UserRole.FLOOR_STAFF,
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
    db_session.add_all([agent, packer, customer, product, catalogue])
    db_session.flush()
    raw_file = RawOrderFile(
        file_name="order.xlsx",
        storage_url="order.xlsx",
        shipment_target_date="2026-09-10",
        route_line="TETE",
        uploaded_by=agent.id,
        status=OrderStatus.HANDOFF_01_SENT,
    )
    db_session.add(raw_file)
    db_session.flush()
    order = ClientOrder(
        raw_order_file_id=raw_file.id,
        customer_id=customer.id,
        order_ref_id="ORD-20260910-BUYER1",
        total_ordered_items_count=6,
        total_estimated_net_weight_kg=6,
        status=OrderStatus.HANDOFF_01_SENT,
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        ClientOrderItem(
            client_order_id=order.id,
            product_id=product.id,
            raw_produce_text="T001 - Herb",
            pack_size="1kg",
            ordered_pack_count=6,
            estimated_net_weight_kg=6,
        )
    )
    db_session.commit()
    return agent, packer, order


def test_design_persists_deterministic_boxes_and_starts_floor_work(db_session):
    agent, packer, order = setup_order(db_session)

    boxes = PackingPlanningService(db_session).design_order(order_id=order.id, actor=agent)
    PackingPlanningService(db_session).start_floor_packing(order_id=order.id, actor=packer)

    assert len(boxes) == 2
    assert [sum(item.final_packed_count for item in box.items) for box in boxes] == [5, 1]
    assert order.status == OrderStatus.FLOOR_PACKING
    assert all(box.qr_code_uid.startswith("BOX-TETE-20260910-") for box in boxes)


def test_final_pack_lock_is_immutable_and_produces_handoff_02(db_session):
    agent, packer, order = setup_order(db_session)
    boxes = PackingPlanningService(db_session).design_order(order_id=order.id, actor=agent)
    PackingPlanningService(db_session).start_floor_packing(order_id=order.id, actor=packer)
    for box in boxes:
        box.actual_net_weight_kg = sum(float(item.final_net_weight_kg) for item in box.items)
        box.actual_gross_weight_kg = float(box.actual_net_weight_kg) + 0.5
    db_session.commit()

    FinalPackingService(db_session).lock_order(order_id=order.id, actor=packer)
    handoff = HandoffService(db_session).return_handoff_02(order_id=order.id, actor=agent)

    assert all(box.is_locked for box in db_session.query(Box).all())
    assert order.status == OrderStatus.HANDOFF_02_RETURNED
    assert handoff.handoff_type == "HANDOFF_02_FINAL_PACKING"
    assert handoff.payload_json["total_boxes_count"] == 2
    assert db_session.query(AgentHandoff).count() == 1
