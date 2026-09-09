import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Enum, Numeric, ForeignKey, JSON
from sqlalchemy.orm import relationship, backref
from app.core.database import Base

class BoxMaterial(str, enum.Enum):
    FOAM = 'FOAM'
    CARDBOARD = 'CARDBOARD'

class TemperatureZone(str, enum.Enum):
    COLD = 'COLD'
    NORMAL = 'NORMAL'

class ControlStatus(str, enum.Enum):
    EL = 'EL'
    COMBINABLE = 'COMBINABLE'

class ProduceType(str, enum.Enum):
    LEAFY = 'LEAFY'
    FRUIT = 'FRUIT'
    HERB = 'HERB'
    ROOT = 'ROOT'

class WeightClass(str, enum.Enum):
    LIGHT = 'LIGHT'
    HEAVY = 'HEAVY'

class Product(Base):
    __tablename__ = 'products'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    t_code = Column(String(16), unique=True, nullable=False, index=True)
    numeric_code = Column(String(16), nullable=True, index=True)
    name_vi = Column(String(256), nullable=False, index=True)
    name_en = Column(String(256), nullable=False, index=True)
    name_th = Column(String(256), nullable=False, index=True)
    box_material = Column(Enum(BoxMaterial), nullable=False)
    temperature = Column(Enum(TemperatureZone), nullable=False)
    control_status = Column(Enum(ControlStatus), nullable=False)
    produce_type = Column(Enum(ProduceType), nullable=False)
    weight_class = Column(Enum(WeightClass), nullable=False)
    botanical_family = Column(String(128), nullable=True, index=True)
    default_unit_volume_cm3 = Column(Numeric(10, 2), nullable=False, default=1000.00)
    default_pack_sizes = Column(JSON, nullable=False, default=list) # List of pack sizes e.g. ['100g', '200g']
    tare_weight_allowance_g = Column(Numeric(8, 2), default=15.00)
    default_buffer_percentage = Column(Numeric(5, 2), default=0.00) # Sticky buffer memory
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class BoxCatalogue(Base):
    __tablename__ = 'box_catalogue'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    box_type = Column(Enum(BoxMaterial), nullable=False)
    size_name = Column(String(64), nullable=False) # Small, Flat, Giant, etc.
    length_cm = Column(Numeric(6, 2), nullable=False)
    width_cm = Column(Numeric(6, 2), nullable=False)
    height_cm = Column(Numeric(6, 2), nullable=False)
    rated_weight_kg = Column(Numeric(6, 2), nullable=False)
    volume_m3 = Column(Numeric(8, 4), nullable=False)
    max_safe_net_weight_kg = Column(Numeric(6, 2), nullable=False)
    is_active = Column(Boolean, default=True)

class Customer(Base):
    __tablename__ = 'customers'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_code = Column(String(64), unique=True, nullable=False, index=True) # e.g. 'TONIO-MAIN', 'CT-Trung', 'BE-A24'
    company_name = Column(String(256), nullable=False)
    billing_email = Column(String(255), nullable=False)
    route_group = Column(String(32), nullable=False, index=True) # 'TETE', 'NGA', 'BE', 'CT', 'PTT'
    destination_country = Column(String(64), nullable=False)
    tax_vat_id = Column(String(64), nullable=True)
    payment_terms_days = Column(Numeric(4, 0), default=7)
    is_main_customer = Column(Boolean, default=False)
    parent_customer_id = Column(String(36), ForeignKey('customers.id'), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sub_customers = relationship('Customer', backref=backref('parent_customer', remote_side=[id]))

class PriceList(Base):
    __tablename__ = 'price_lists'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey('products.id'), nullable=False)
    customer_id = Column(String(36), ForeignKey('customers.id'), nullable=True) # NULL = Global default price
    pack_size = Column(String(64), nullable=False)
    unit_price_eur = Column(Numeric(10, 2), nullable=False)
    valid_from = Column(String(10), nullable=False) # 'YYYY-MM-DD'
    valid_to = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ClientSkuMapping(Base):
    __tablename__ = 'client_sku_mappings'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    main_customer_id = Column(String(36), ForeignKey('customers.id'), nullable=True, index=True)
    client_sku_code = Column(String(64), nullable=True, index=True)
    client_raw_name = Column(String(256), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey('products.id'), nullable=False, index=True)
    standard_pack_size = Column(String(64), nullable=True)
    is_verified = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    product = relationship('Product')
    main_customer = relationship('Customer', foreign_keys=[main_customer_id])

class CustomerSellingPrice(Base):
    __tablename__ = 'customer_selling_prices'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    main_customer_id = Column(String(36), ForeignKey('customers.id'), nullable=False, index=True)
    sub_customer_id = Column(String(36), ForeignKey('customers.id'), nullable=True, index=True) # NULL = all sub-customers
    product_id = Column(String(36), ForeignKey('products.id'), nullable=False, index=True)
    pack_size = Column(String(64), nullable=False)
    selling_price_eur = Column(Numeric(10, 2), nullable=False)
    valid_from = Column(String(10), nullable=False) # 'YYYY-MM-DD'
    valid_to = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    product = relationship('Product')
    main_customer = relationship('Customer', foreign_keys=[main_customer_id])
    sub_customer = relationship('Customer', foreign_keys=[sub_customer_id])
