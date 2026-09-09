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
