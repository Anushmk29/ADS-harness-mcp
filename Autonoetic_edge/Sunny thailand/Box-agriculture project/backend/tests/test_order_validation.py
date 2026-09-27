from openpyxl import Workbook

from app.models.master_data import (
    BoxMaterial,
    ControlStatus,
    ProduceType,
    Product,
    TemperatureZone,
    WeightClass,
)
from app.models.order import OrderStatus, RawOrderFile
from app.models.user import User, UserRole
from app.modules.orders.validation import OrderValidationService


def test_matrix_validation_surfaces_unknown_skus_before_split(db_session, tmp_path):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Orders"
    sheet.cell(3, 6, "CLIENT-1")
    sheet.append([])
    sheet.cell(5, 1, "T001")
    sheet.cell(5, 2, "Rau")
    sheet.cell(5, 3, "Herb")
    sheet.cell(5, 5, "1kg")
    sheet.cell(5, 6, 2)
    sheet.cell(6, 1, "UNKNOWN")
    sheet.cell(6, 2, "La moi")
    sheet.cell(6, 3, "Unknown leaf")
    sheet.cell(6, 5, "1kg")
    sheet.cell(6, 6, 1)
    path = tmp_path / "order.xlsx"
    workbook.save(path)

    agent = User(
        email="agent1@example.com",
        password_hash="unused",
        full_name="Agent One",
        role=UserRole.AI_AGENT_1,
        is_service_principal=True,
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
    db_session.add_all([agent, product])
    db_session.flush()
    raw_file = RawOrderFile(
        file_name=path.name,
        storage_url=str(path),
        shipment_target_date="2026-09-10",
        route_line="TETE",
        uploaded_by=agent.id,
        status=OrderStatus.UPLOADED,
    )
    db_session.add(raw_file)
    db_session.commit()

    result = OrderValidationService(db_session).validate(raw_file_id=raw_file.id, actor=agent)

    assert raw_file.status == OrderStatus.PARSED
    assert result.total_product_rows == 2
    assert result.resolved_product_rows == 1
    assert [issue.product_code for issue in result.unresolved] == ["UNKNOWN"]


def test_matrix_validation_tries_every_available_language_name(db_session, tmp_path):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Orders"
    sheet.cell(3, 6, "CLIENT-1")
    sheet.cell(5, 1, "LEGACY-212")
    sheet.cell(5, 2, "Me Manila")
    sheet.cell(5, 3, "Manila tamarind")
    sheet.cell(5, 5, "500g")
    sheet.cell(5, 6, 1)
    path = tmp_path / "multilingual-order.xlsx"
    workbook.save(path)

    agent = User(
        email="agent1-multilingual@example.com",
        password_hash="unused",
        full_name="Agent One",
        role=UserRole.AI_AGENT_1,
        is_service_principal=True,
    )
    product = Product(
        t_code="22-234",
        name_vi="มะขามเทศ",
        name_en="Manila Tamarind",
        name_th="มะขามเทศ",
        box_material=BoxMaterial.FOAM,
        temperature=TemperatureZone.COLD,
        control_status=ControlStatus.COMBINABLE,
        produce_type=ProduceType.FRUIT,
        weight_class=WeightClass.LIGHT,
        default_pack_sizes=["500g"],
    )
    db_session.add_all([agent, product])
    db_session.flush()
    raw_file = RawOrderFile(
        file_name=path.name,
        storage_url=str(path),
        shipment_target_date="2026-09-10",
        route_line="TETE",
        uploaded_by=agent.id,
        status=OrderStatus.UPLOADED,
    )
    db_session.add(raw_file)
    db_session.commit()

    result = OrderValidationService(db_session).validate(raw_file_id=raw_file.id, actor=agent)

    assert result.resolved_product_rows == 1
    assert result.unresolved == []


def test_matrix_can_be_revalidated_after_staff_maps_an_unresolved_sku(db_session, tmp_path):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Orders"
    sheet.cell(3, 6, "CLIENT-1")
    sheet.cell(5, 1, "NEW-001")
    sheet.cell(5, 2, "New leaf")
    sheet.cell(5, 3, "New leaf")
    sheet.cell(5, 5, "100g")
    sheet.cell(5, 6, 2)
    path = tmp_path / "remappable-order.xlsx"
    workbook.save(path)

    agent = User(
        email="agent1-remap@example.com",
        password_hash="unused",
        full_name="Agent One",
        role=UserRole.AI_AGENT_1,
        is_service_principal=True,
    )
    db_session.add(agent)
    db_session.flush()
    raw_file = RawOrderFile(
        file_name=path.name,
        storage_url=str(path),
        shipment_target_date="2026-09-10",
        route_line="TETE",
        uploaded_by=agent.id,
        status=OrderStatus.UPLOADED,
    )
    db_session.add(raw_file)
    db_session.commit()

    first = OrderValidationService(db_session).validate(raw_file_id=raw_file.id, actor=agent)
    assert not first.can_split

    product = Product(
        t_code="NEW-001",
        name_vi="New leaf",
        name_en="New leaf",
        name_th="New leaf",
        box_material=BoxMaterial.CARDBOARD,
        temperature=TemperatureZone.NORMAL,
        control_status=ControlStatus.COMBINABLE,
        produce_type=ProduceType.LEAFY,
        weight_class=WeightClass.LIGHT,
        default_pack_sizes=["100g"],
    )
    db_session.add(product)
    db_session.commit()

    second = OrderValidationService(db_session).validate(raw_file_id=raw_file.id, actor=agent)

    assert second.can_split
    assert second.unresolved == []
