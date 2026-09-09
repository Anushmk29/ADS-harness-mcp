from __future__ import annotations

from typing import Protocol

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.order import OrderStatus
from app.models.user import User


class WorkflowTarget(Protocol):
    id: str
    status: OrderStatus


class WorkflowTransitionError(ValueError):
    """Raised when an operation attempts to bypass the order lifecycle."""


NEXT_STATUS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.UPLOADED: frozenset({OrderStatus.PARSED}),
    OrderStatus.PARSED: frozenset({OrderStatus.SPLIT_AND_VALIDATED}),
    OrderStatus.SPLIT_AND_VALIDATED: frozenset({OrderStatus.PURCHASING_CONSOLIDATED}),
    OrderStatus.PURCHASING_CONSOLIDATED: frozenset({OrderStatus.PROCUREMENT_CONFIRMED}),
    OrderStatus.PROCUREMENT_CONFIRMED: frozenset({OrderStatus.HANDOFF_01_SENT}),
    OrderStatus.HANDOFF_01_SENT: frozenset({OrderStatus.PACKING_DESIGNED}),
    OrderStatus.PACKING_DESIGNED: frozenset({OrderStatus.FLOOR_PACKING}),
    OrderStatus.FLOOR_PACKING: frozenset({OrderStatus.FINAL_PACK_LOCKED}),
    OrderStatus.FINAL_PACK_LOCKED: frozenset({OrderStatus.HANDOFF_02_RETURNED}),
    OrderStatus.HANDOFF_02_RETURNED: frozenset({OrderStatus.INVOICES_DRAFTED}),
    OrderStatus.INVOICES_DRAFTED: frozenset({OrderStatus.INVOICES_SENT}),
    OrderStatus.INVOICES_SENT: frozenset({OrderStatus.CONFIRMED_PAID}),
    OrderStatus.CONFIRMED_PAID: frozenset({OrderStatus.RECEIPTS_ISSUED}),
    OrderStatus.RECEIPTS_ISSUED: frozenset({OrderStatus.ORDER_CLOSED}),
    OrderStatus.ORDER_CLOSED: frozenset(),
}


class WorkflowService:
    """Single authority for lifecycle transitions and their audit events."""

    def __init__(self, db: Session):
        self.db = db

    def transition(
        self,
        *,
        target: WorkflowTarget,
        to_status: OrderStatus,
        actor: User,
        target_table: str,
    ) -> None:
        from_status = OrderStatus(target.status)
        if to_status not in NEXT_STATUS[from_status]:
            raise WorkflowTransitionError(
                f"Illegal workflow transition: {from_status.value} -> {to_status.value}"
            )

        target.status = to_status
        self.db.add(
            AuditLog(
                event_type="WORKFLOW_TRANSITION",
                actor_id=actor.id,
                actor_role=actor.role.value,
                target_table=target_table,
                target_id=target.id,
                before_state={"status": from_status.value},
                after_state={"status": to_status.value},
            )
        )
        self.db.flush()
