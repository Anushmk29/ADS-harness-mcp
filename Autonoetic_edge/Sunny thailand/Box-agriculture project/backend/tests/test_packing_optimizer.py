from app.models.master_data import (
    BoxMaterial,
    ControlStatus,
    ProduceType,
    TemperatureZone,
    WeightClass,
)
from app.modules.packing.optimizer import (
    DeterministicPackingOptimizer,
    PackingDemand,
    PackingOption,
)


def demand(product_id: str, *, material=BoxMaterial.FOAM, temperature=TemperatureZone.COLD):
    return PackingDemand(
        product_id=product_id,
        pack_size="1kg",
        pack_count=3,
        unit_weight_kg=1.0,
        box_material=material,
        temperature=temperature,
        control_status=ControlStatus.COMBINABLE,
        produce_type=ProduceType.HERB,
        weight_class=WeightClass.LIGHT,
    )


def test_optimizer_never_mixes_incompatible_material_or_temperature():
    plan = DeterministicPackingOptimizer().solve(
        demands=[
            demand("cold-foam"),
            demand(
                "normal-cardboard",
                material=BoxMaterial.CARDBOARD,
                temperature=TemperatureZone.NORMAL,
            ),
        ],
        options=[
            PackingOption("foam-5", BoxMaterial.FOAM, 5.0),
            PackingOption("card-5", BoxMaterial.CARDBOARD, 5.0),
        ],
        route_code="TETE",
    )

    assert len(plan.boxes) == 2
    for box in plan.boxes:
        assert len({item.box_material for item in box.items}) == 1
        assert len({item.temperature for item in box.items}) == 1


def test_optimizer_splits_packs_without_exceeding_box_capacity():
    heavy = demand("heavy")
    heavy = PackingDemand(**{**heavy.__dict__, "pack_count": 6, "unit_weight_kg": 2.0})

    plan = DeterministicPackingOptimizer().solve(
        demands=[heavy],
        options=[PackingOption("foam-5", BoxMaterial.FOAM, 5.0)],
        route_code="TETE",
    )

    assert sum(item.pack_count for box in plan.boxes for item in box.items) == 6
    assert all(box.total_net_weight_kg <= 5.0 for box in plan.boxes)
    assert [box.total_net_weight_kg for box in plan.boxes] == [4.0, 4.0, 4.0]
