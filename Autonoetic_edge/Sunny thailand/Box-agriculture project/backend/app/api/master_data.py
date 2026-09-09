from fastapi import APIRouter, Depends
from typing import List, Optional
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from app.core.database import get_db
from app.models.master_data import Product, BoxCatalogue, Customer

router = APIRouter(prefix="/master-data", tags=["Master Data"])

class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    t_code: str
    name_vi: str
    name_en: str
    name_th: str
    box_material: str
    temperature: str
    control_status: str

class BoxOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    box_type: str
    size_name: str
    length_cm: float
    width_cm: float
    height_cm: float
    rated_weight_kg: float
    volume_m3: float

class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_code: str
    company_name: str
    route_group: str
    destination_country: str

@router.get("/products", response_model=List[ProductOut])
def list_products(limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Product).filter(Product.is_active == True).limit(limit).all()

@router.get("/boxes", response_model=List[BoxOut])
def list_boxes(db: Session = Depends(get_db)):
    return db.query(BoxCatalogue).filter(BoxCatalogue.is_active == True).all()

@router.get("/customers", response_model=List[CustomerOut])
def list_customers(route: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Customer)
    if route:
        q = q.filter(Customer.route_group == route)
    return q.all()
