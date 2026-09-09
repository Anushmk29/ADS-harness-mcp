from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, handoffs, master_data, orders, procurement, packing, invoicing, sku_mappings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="3.0.0",
    description="Enterprise API for Two-Agent Autonomous Order-to-Cash & Packing System (Agriculture is Life Co., Ltd.)"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers under /api/v3
app.include_router(auth.router, prefix=settings.API_V3_STR)
app.include_router(master_data.router, prefix=settings.API_V3_STR)
app.include_router(orders.router, prefix=settings.API_V3_STR)
app.include_router(procurement.router, prefix=settings.API_V3_STR)
app.include_router(packing.router, prefix=settings.API_V3_STR)
app.include_router(invoicing.router, prefix=settings.API_V3_STR)
app.include_router(sku_mappings.router, prefix=settings.API_V3_STR)
app.include_router(handoffs.router, prefix=settings.API_V3_STR)

@app.get("/")
def root():
    return {
        "platform": settings.PROJECT_NAME,
        "version": "v3.0",
        "client": "Agriculture is Life Co., Ltd.",
        "status": "OPERATIONAL",
        "docs_url": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "HEALTHY"}
