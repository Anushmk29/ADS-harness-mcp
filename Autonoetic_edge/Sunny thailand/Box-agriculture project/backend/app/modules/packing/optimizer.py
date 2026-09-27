from __future__ import annotations

from dataclasses import dataclass, field

from app.models.master_data import (
    BoxMaterial,
    ControlStatus,
    ProduceType,
    TemperatureZone,
    WeightClass,
)


@dataclass(frozen=True)
class PackingDemand:
    product_id: str
    pack_size: str
    pack_count: int
    unit_weight_kg: float
    box_material: BoxMaterial
    temperature: TemperatureZone
    control_status: ControlStatus
    produce_type: ProduceType
    weight_class: WeightClass
    botanical_family: str | None
    unit_volume_cm3: float

    def compatibility_key(self, route_code: str) -> tuple[str, ...]:
        if route_code.upper() == "NGA":
            control = "NGA_MIX_ALLOWED"
        elif self.control_status == ControlStatus.EL:
            # Missing family data is isolated per product rather than mixed unsafely.
            control = f"EL:{self.botanical_family or self.product_id}"
        else:
            control = self.control_status.value
        return (
            self.box_material.value,
            self.temperature.value,
            control,
            self.produce_type.value,
            self.weight_class.value,
        )


@dataclass(frozen=True)
class PackingOption:
    id: str
    material: BoxMaterial
    max_safe_net_weight_kg: float
    internal_volume_cm3: float

    @property
    def usable_volume_cm3(self) -> float:
        return self.internal_volume_cm3 * 0.92


@dataclass
class PlannedItem:
    product_id: str
    pack_size: str
    pack_count: int
    unit_weight_kg: float
    box_material: BoxMaterial
    temperature: TemperatureZone
    control_status: ControlStatus
    produce_type: ProduceType
    weight_class: WeightClass
    unit_volume_cm3: float

    @property
    def net_weight_kg(self) -> float:
        return round(self.pack_count * self.unit_weight_kg, 2)


@dataclass
class PlannedBox:
    option: PackingOption
    compatibility_key: tuple[str, ...]
    items: list[PlannedItem] = field(default_factory=list)

    @property
    def total_net_weight_kg(self) -> float:
        return round(sum(item.net_weight_kg for item in self.items), 2)

    @property
    def total_volume_cm3(self) -> float:
        return round(sum(item.pack_count * item.unit_volume_cm3 for item in self.items), 2)


@dataclass(frozen=True)
class PackingPlan:
    route_code: str
    boxes: list[PlannedBox]


class DeterministicPackingOptimizer:
    """Best-fit-decreasing weight planner with the PRD's hard segregation rules."""

    def solve(
        self,
        *,
        demands: list[PackingDemand],
        options: list[PackingOption],
        route_code: str,
    ) -> PackingPlan:
        if not options:
            raise ValueError("At least one active box option is required")
        if any(
            d.pack_count < 1 or d.unit_weight_kg <= 0 or d.unit_volume_cm3 <= 0 for d in demands
        ):
            raise ValueError("Packing demand counts, weights, and volumes must be positive")

        usable = sorted(options, key=lambda option: (option.max_safe_net_weight_kg, option.id))
        boxes: list[PlannedBox] = []

        units = [demand for demand in demands for _ in range(demand.pack_count)]
        units.sort(
            key=lambda item: (
                -item.unit_weight_kg,
                item.compatibility_key(route_code),
                item.product_id,
                item.pack_size,
            )
        )

        for unit in units:
            key = unit.compatibility_key(route_code)
            candidates = [
                box
                for box in boxes
                if box.compatibility_key == key
                and box.total_net_weight_kg + unit.unit_weight_kg
                <= box.option.max_safe_net_weight_kg + 1e-9
                and box.total_volume_cm3 + unit.unit_volume_cm3
                <= box.option.usable_volume_cm3 + 1e-9
            ]
            if candidates:
                box = min(
                    candidates,
                    key=lambda candidate: (
                        candidate.option.max_safe_net_weight_kg
                        - candidate.total_net_weight_kg
                        - unit.unit_weight_kg,
                        boxes.index(candidate),
                    ),
                )
            else:
                fitting = [
                    option
                    for option in usable
                    if option.material == unit.box_material
                    and option.max_safe_net_weight_kg + 1e-9 >= unit.unit_weight_kg
                    and option.usable_volume_cm3 + 1e-9 >= unit.unit_volume_cm3
                ]
                if not fitting:
                    raise ValueError(
                        f"No {unit.box_material.value} box can safely hold "
                        f"one {unit.pack_size} pack of product {unit.product_id}"
                    )
                box = PlannedBox(option=fitting[0], compatibility_key=key)
                boxes.append(box)

            existing = next(
                (
                    item
                    for item in box.items
                    if item.product_id == unit.product_id and item.pack_size == unit.pack_size
                ),
                None,
            )
            if existing:
                existing.pack_count += 1
            else:
                box.items.append(
                    PlannedItem(
                        product_id=unit.product_id,
                        pack_size=unit.pack_size,
                        pack_count=1,
                        unit_weight_kg=unit.unit_weight_kg,
                        box_material=unit.box_material,
                        temperature=unit.temperature,
                        control_status=unit.control_status,
                        produce_type=unit.produce_type,
                        weight_class=unit.weight_class,
                        unit_volume_cm3=unit.unit_volume_cm3,
                    )
                )

        return PackingPlan(route_code=route_code.upper(), boxes=boxes)
