from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.master_data import ClientSkuMapping, CustomerSellingPrice, Product

router = APIRouter(prefix="/master-data/sku-mappings", tags=["Master Data: SKU Standardization & Selling Prices"])

class SkuMappingCreate(BaseModel):
    main_customer_id: Optional[str] = None
    client_sku_code: Optional[str] = None
    client_raw_name: str
    product_id: str
    standard_pack_size: Optional[str] = "100g"

class SkuMappingOut(BaseModel):
    id: str
    main_customer_id: Optional[str]
    client_sku_code: Optional[str]
    client_raw_name: str
    product_id: str
    product_name_vi: str
    product_name_en: str
    standard_pack_size: Optional[str]
    is_verified: bool

class SellingPriceCreate(BaseModel):
    main_customer_id: str
    sub_customer_id: Optional[str] = None # NULL = applies to all sub-customers of this main customer
    product_id: str
    pack_size: str
    selling_price_eur: float
    valid_from: str = "2026-01-01"
    valid_to: Optional[str] = None

class SellingPriceOut(BaseModel):
    id: str
    main_customer_id: str
    sub_customer_id: Optional[str]
    product_id: str
    pack_size: str
    selling_price_eur: float
    valid_from: str
    valid_to: Optional[str]

@router.post("", response_model=SkuMappingOut)
def create_or_update_sku_mapping(payload: SkuMappingCreate, db: Session = Depends(get_db)):
    """
    SKU Standardization:
    Pre-feed client SKU database list to eliminate duplicate entries and typos.
    """
    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {payload.product_id} not found")

    existing = db.query(ClientSkuMapping).filter(
        ClientSkuMapping.main_customer_id == payload.main_customer_id,
        ClientSkuMapping.client_raw_name == payload.client_raw_name.strip()
    ).first()

    if existing:
        existing.client_sku_code = payload.client_sku_code.strip().upper() if payload.client_sku_code else None
        existing.product_id = product.id
        existing.standard_pack_size = payload.standard_pack_size
        mapping = existing
    else:
        mapping = ClientSkuMapping(
            main_customer_id=payload.main_customer_id,
            client_sku_code=payload.client_sku_code.strip().upper() if payload.client_sku_code else None,
            client_raw_name=payload.client_raw_name.strip(),
            product_id=product.id,
            standard_pack_size=payload.standard_pack_size,
            is_verified=True
        )
        db.add(mapping)

    db.commit()
    db.refresh(mapping)

    return SkuMappingOut(
        id=mapping.id,
        main_customer_id=mapping.main_customer_id,
        client_sku_code=mapping.client_sku_code,
        client_raw_name=mapping.client_raw_name,
        product_id=product.id,
        product_name_vi=product.name_vi,
        product_name_en=product.name_en,
        standard_pack_size=mapping.standard_pack_size,
        is_verified=mapping.is_verified
    )

@router.get("", response_model=List[SkuMappingOut])
def list_sku_mappings(main_customer_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(ClientSkuMapping)
    if main_customer_id:
        query = query.filter(
            (ClientSkuMapping.main_customer_id == main_customer_id) | (ClientSkuMapping.main_customer_id.is_(None))
        )
    mappings = query.all()

    return [
        SkuMappingOut(
            id=m.id,
            main_customer_id=m.main_customer_id,
            client_sku_code=m.client_sku_code,
            client_raw_name=m.client_raw_name,
            product_id=m.product_id,
            product_name_vi=m.product.name_vi if m.product else "",
            product_name_en=m.product.name_en if m.product else "",
            standard_pack_size=m.standard_pack_size,
            is_verified=m.is_verified
        )
        for m in mappings
    ]

@router.post("/selling-prices", response_model=SellingPriceOut)
def set_main_customer_selling_price(payload: SellingPriceCreate, db: Session = Depends(get_db)):
    """
    On-Behalf Invoicing Database:
    Configures the main customer's designated selling prices for their sub-customers.
    """
    price_entry = db.query(CustomerSellingPrice).filter(
        CustomerSellingPrice.main_customer_id == payload.main_customer_id,
        CustomerSellingPrice.sub_customer_id == payload.sub_customer_id,
        CustomerSellingPrice.product_id == payload.product_id,
        CustomerSellingPrice.pack_size == payload.pack_size
    ).first()

    if price_entry:
        price_entry.selling_price_eur = payload.selling_price_eur
        price_entry.valid_from = payload.valid_from
        price_entry.valid_to = payload.valid_to
    else:
        price_entry = CustomerSellingPrice(
            main_customer_id=payload.main_customer_id,
            sub_customer_id=payload.sub_customer_id,
            product_id=payload.product_id,
            pack_size=payload.pack_size,
            selling_price_eur=payload.selling_price_eur,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to
        )
        db.add(price_entry)

    db.commit()
    db.refresh(price_entry)

    return SellingPriceOut(
        id=price_entry.id,
        main_customer_id=price_entry.main_customer_id,
        sub_customer_id=price_entry.sub_customer_id,
        product_id=price_entry.product_id,
        pack_size=price_entry.pack_size,
        selling_price_eur=float(price_entry.selling_price_eur),
        valid_from=price_entry.valid_from,
        valid_to=price_entry.valid_to
    )

