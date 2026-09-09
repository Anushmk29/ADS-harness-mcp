import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Enum, Text
from app.core.database import Base

class UserRole(str, enum.Enum):
    CUSTOMER_AGENT = 'CUSTOMER_AGENT'
    PROCUREMENT_BUYER = 'PROCUREMENT_BUYER'
    FLOOR_STAFF = 'FLOOR_STAFF'
    OPERATIONS_MANAGER = 'OPERATIONS_MANAGER'
    ACCOUNTING_OFFICER = 'ACCOUNTING_OFFICER'
    SYSTEM_ADMIN = 'SYSTEM_ADMIN'
    AI_AGENT_1 = 'AI_AGENT_1'
    AI_AGENT_2 = 'AI_AGENT_2'

class User(Base):
    __tablename__ = 'users'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.OPERATIONS_MANAGER)
    is_service_principal = Column(Boolean, default=False)
    public_key = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
