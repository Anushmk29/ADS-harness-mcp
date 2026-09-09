import os
import sys
import openpyxl

# Add backend to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal, engine, Base
from app.core.security import hash_password
from app.models import (
    User, UserRole, Product, BoxCatalogue, Customer, PriceList,
    BoxMaterial, TemperatureZone, ControlStatus, ProduceType, WeightClass
)

def seed_all():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("--- 1. Seeding Users & Service Principals ---")
        existing_users = {u.email: u for u in db.query(User).all()}
        users_to_create = [
            ("admin@agricultureislife.com", "Admin System", UserRole.SYSTEM_ADMIN, False),
            ("procurement@agricultureislife.com", "Somchai (Buyer)", UserRole.PROCUREMENT_BUYER, False),
            ("packer1@agricultureislife.com", "Noi (Floor Lead)", UserRole.FLOOR_STAFF, False),
            ("manager@agricultureislife.com", "Manager Sunny", UserRole.OPERATIONS_MANAGER, False),
            ("accounting@agricultureislife.com", "Ploi (Finance Officer)", UserRole.ACCOUNTING_OFFICER, False),
            ("customer_agent@exportb2b.com", "Tonio (Customer Agent)", UserRole.CUSTOMER_AGENT, False),
            ("agent1.service@agricultureislife.internal", "AI Agent 1 (Commercial Orchestrator)", UserRole.AI_AGENT_1, True),
            ("agent2.service@agricultureislife.internal", "AI Agent 2 (Fulfillment Orchestrator)", UserRole.AI_AGENT_2, True),
        ]
        for email, name, role, is_sp in users_to_create:
            if email not in existing_users:
                u = User(
                    email=email,
                    full_name=name,
                    password_hash=hash_password("Password123!"),
                    role=role,
                    is_service_principal=is_sp
                )
                db.add(u)
        db.commit()
        print(f"Users seeded. Total: {db.query(User).count()}")

        print("--- 2. Seeding 15 Master Box Types ---")
        existing_boxes = {f"{b.box_type}_{b.size_name}_{b.length_cm}": b for b in db.query(BoxCatalogue).all()}
        boxes_meta = [
            (BoxMaterial.CARDBOARD, "Small", 38, 32, 18, 3.65, 0.0219, 4.50),
            (BoxMaterial.CARDBOARD, "Flat", 50, 32, 18, 4.80, 0.0288, 5.50),
            (BoxMaterial.CARDBOARD, "Special", 34, 40, 28, 6.35, 0.0381, 7.50),
            (BoxMaterial.CARDBOARD, "Tall", 35, 29, 36, 6.09, 0.0365, 7.00),
            (BoxMaterial.CARDBOARD, "Mini", 26, 32, 14, 1.94, 0.0116, 2.50),
            (BoxMaterial.FOAM, "Tiny", 30, 20, 24, 2.40, 0.0144, 3.00),
            (BoxMaterial.FOAM, "Small-tiny", 22, 30, 25, 2.75, 0.0165, 3.50),
            (BoxMaterial.FOAM, "Small", 38, 28, 34, 6.03, 0.0362, 7.00),
            (BoxMaterial.FOAM, "Medium", 30, 40, 30, 6.00, 0.0360, 7.00),
            (BoxMaterial.FOAM, "Special", 31, 40, 30, 6.20, 0.0372, 7.20),
            (BoxMaterial.FOAM, "Special (2)", 36, 24, 32, 4.61, 0.0276, 5.50),
            (BoxMaterial.FOAM, "Flat", 54, 42, 21, 7.94, 0.0476, 9.00),
            (BoxMaterial.FOAM, "Flat-tiny", 15, 38, 54, 5.13, 0.0308, 6.00),
            (BoxMaterial.FOAM, "Large", 46, 34, 36, 9.38, 0.0563, 11.00),
            (BoxMaterial.FOAM, "Giant", 60, 44, 30, 13.20, 0.0792, 15.00),
        ]
        for b_type, s_name, l, w, h, rated_w, vol, max_safe in boxes_meta:
            key = f"{b_type}_{s_name}_{l}"
            if key not in existing_boxes:
                b = BoxCatalogue(
                    box_type=b_type,
                    size_name=s_name,
                    length_cm=l,
                    width_cm=w,
                    height_cm=h,
                    rated_weight_kg=rated_w,
                    volume_m3=vol,
                    max_safe_net_weight_kg=max_safe
                )
                db.add(b)
        db.commit()
        print(f"Boxes seeded. Total: {db.query(BoxCatalogue).count()}")

        print("--- 3. Seeding Product Catalogue from Order & Grouping Master ---")
        doc_dir = os.path.join(os.path.dirname(backend_dir), "documents")
        order_file = os.path.join(doc_dir, "Order Tonio 07.07.26 FULL.xlsx")
        grouping_file = os.path.join(doc_dir, "Rev.1 Grouping List.xlsx")

        existing_prods = {p.t_code: p for p in db.query(Product).all()}

        # First load taxonomies from Rev.1 Grouping List
        grouping_tax = {}
        if os.path.exists(grouping_file):
            wb_g = openpyxl.load_workbook(grouping_file, data_only=True)
            ws_g = wb_g.active
            for r in range(3, ws_g.max_row + 1):
                desc = str(ws_g.cell(r, 4).value or "").strip()
                foam = ws_g.cell(r, 5).value
                cardboard = ws_g.cell(r, 6).value
                el = ws_g.cell(r, 7).value
                combinable = ws_g.cell(r, 8).value
                if desc:
                    clean_name = desc.replace("**", "").replace("BB", "").replace("TT", "").replace("NN", "").strip()
                    grouping_tax[clean_name.lower()] = {
                        "material": BoxMaterial.FOAM if foam else BoxMaterial.CARDBOARD,
                        "temp": TemperatureZone.COLD if foam else TemperatureZone.NORMAL,
                        "control": ControlStatus.EL if el else ControlStatus.COMBINABLE,
                    }

        # Extract produce from Order Sheet
        if os.path.exists(order_file):
            wb_o = openpyxl.load_workbook(order_file, data_only=True)
            ws_o = wb_o["Group 1"]
            for row in range(5, ws_o.max_row + 1):
                code = str(ws_o.cell(row, 1).value or "").strip()
                name_vi = str(ws_o.cell(row, 2).value or "").strip()
                name_en = str(ws_o.cell(row, 3).value or "").strip()
                name_th = str(ws_o.cell(row, 4).value or "").strip()
                pack = str(ws_o.cell(row, 5).value or "").strip()

                if code and (name_vi or name_en):
                    if code not in existing_prods:
                        matched_tax = grouping_tax.get(name_th.lower(), {})
                        material = matched_tax.get("material", BoxMaterial.FOAM if "tray" in pack.lower() or "cold" in name_en.lower() else BoxMaterial.CARDBOARD)
                        temp = matched_tax.get("temp", TemperatureZone.COLD if material == BoxMaterial.FOAM else TemperatureZone.NORMAL)
                        control = matched_tax.get("control", ControlStatus.COMBINABLE)
                        ptype = ProduceType.LEAFY if "leaf" in name_en.lower() or "herb" in name_en.lower() or "glory" in name_en.lower() else ProduceType.FRUIT
                        wclass = WeightClass.LIGHT if "100g" in pack or "tray" in pack else WeightClass.HEAVY

                        p = Product(
                            t_code=code,
                            numeric_code=code.replace("T", "11").replace("-", ""),
                            name_vi=name_vi or name_en,
                            name_en=name_en or name_vi,
                            name_th=name_th or name_en,
                            box_material=material,
                            temperature=temp,
                            control_status=control,
                            produce_type=ptype,
                            weight_class=wclass,
                            default_pack_sizes=[pack] if pack else ["100g"]
                        )
                        db.add(p)
                        existing_prods[code] = p
            db.commit()

        # Seed additional items from grouping master up to ~279
        if os.path.exists(grouping_file):
            wb_g = openpyxl.load_workbook(grouping_file, data_only=True)
            ws_g = wb_g.active
            idx = 100
            for r in range(3, ws_g.max_row + 1):
                desc = str(ws_g.cell(r, 4).value or "").strip()
                foam = ws_g.cell(r, 5).value
                el = ws_g.cell(r, 7).value
                if desc:
                    clean_name = desc.replace("**", "").replace("BB", "").replace("TT", "").replace("NN", "").strip()
                    code = f"T{idx:03d}"
                    idx += 1
                    if code not in existing_prods:
                        p = Product(
                            t_code=code,
                            numeric_code=f"11{idx:03d}",
                            name_vi=clean_name,
                            name_en=clean_name,
                            name_th=clean_name,
                            box_material=BoxMaterial.FOAM if foam else BoxMaterial.CARDBOARD,
                            temperature=TemperatureZone.COLD if foam else TemperatureZone.NORMAL,
                            control_status=ControlStatus.EL if el else ControlStatus.COMBINABLE,
                            produce_type=ProduceType.LEAFY if "ผัก" in clean_name else ProduceType.FRUIT,
                            weight_class=WeightClass.LIGHT,
                            default_pack_sizes=["100g tray", "200g", "500g", "1kg"]
                        )
                        db.add(p)
                        existing_prods[code] = p
            db.commit()
        print(f"Products seeded. Total: {db.query(Product).count()}")

        print("--- 4. Seeding Customer Accounts Discovered in Order Sheets ---")
        existing_custs = {c.client_code: c for c in db.query(Customer).all()}
        if os.path.exists(order_file):
            wb_o = openpyxl.load_workbook(order_file, data_only=True)
            for sheet_name in wb_o.sheetnames:
                ws = wb_o[sheet_name]
                for col in range(6, ws.max_column + 1):
                    header_val = ws.cell(3, col).value
                    if header_val and str(header_val).strip() and not str(header_val).startswith("#"):
                        client_code = str(header_val).strip()
                        if client_code not in existing_custs:
                            route = sheet_name.split()[0] if sheet_name != "Group 1" else "CT"
                            country = "Norway" if "NGA" in client_code else "France"
                            c = Customer(
                                client_code=client_code,
                                company_name=f"Client {client_code}",
                                billing_email=f"{client_code.lower().replace(' ', '_')}@clienttrade.eu",
                                route_group=route,
                                destination_country=country
                            )
                            db.add(c)
                            existing_custs[client_code] = c
            db.commit()
        print(f"Customers seeded. Total: {db.query(Customer).count()}")

        print("--- Master Data Seeding Finished Successfully! ---")
    finally:
        db.close()

if __name__ == "__main__":
    seed_all()
