import os
import sys
import json
from datetime import datetime
from decimal import Decimal

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, MetaData, Table, inspect, Boolean, DateTime, JSON, Numeric, text, select, func
from app.core.config import settings
from app.core.database import normalize_database_url

def migrate_data():
    sqlite_path = os.path.join(backend_dir, "fresh_produce_dev.db").replace("\\", "/")
    if not os.path.exists(sqlite_path):
        print(f"SQLite file not found at {sqlite_path}")
        return

    sqlite_url = f"sqlite:///{sqlite_path}"
    supabase_url = normalize_database_url(settings.DATABASE_URL)

    print(f"Migrating from: {sqlite_url}")
    print(f"Migrating to Supabase: {supabase_url[:35]}...")

    src_engine = create_engine(sqlite_url)
    dst_engine = create_engine(supabase_url, pool_pre_ping=True)

    src_meta = MetaData()
    src_meta.reflect(bind=src_engine)

    dst_meta = MetaData()
    dst_meta.reflect(bind=dst_engine)

    # Tables in topological dependency order
    table_order = [
        "users",
        "box_catalogue",
        "customers",
        "products",
        "price_lists",
        "customer_selling_prices",
        "client_sku_mappings",
        "raw_order_files",
        "client_orders",
        "client_order_items",
        "master_purchasing_lists",
        "purchasing_items",
        "purchasing_order_sources",
        "boxes",
        "box_items",
        "invoices",
        "invoice_line_items",
        "receipts",
        "payment_transactions",
        "transportation_manifests",
        "agent_handoffs",
        "audit_logs",
    ]

    with src_engine.connect() as src_conn, dst_engine.connect() as dst_conn:
        try:
            dst_conn.execute(text("SET session_replication_role = 'replica';"))
            dst_conn.commit()
            print("Session replication role set to 'replica' (bypassing FK constraints).")
        except Exception as e:
            print(f"Note on replication role: {e}")

        for table_name in table_order:
            if table_name not in src_meta.tables or table_name not in dst_meta.tables:
                print(f"Skipping {table_name} (not found in source or target)")
                continue

            src_table = src_meta.tables[table_name]
            dst_table = dst_meta.tables[table_name]

            existing_count = dst_conn.scalar(select(func.count()).select_from(dst_table))
            if existing_count > 0:
                print(f"Table '{table_name}' already has {existing_count} rows in Supabase. Skipping.")
                continue

            rows = src_conn.execute(src_table.select()).mappings().all()
            if not rows:
                print(f"Table '{table_name}': 0 rows in source.")
                continue

            # Special ordering for customers to put parents before children
            if table_name == "customers":
                rows = sorted(rows, key=lambda r: 0 if not r.get("parent_customer_id") else 1)

            print(f"Migrating '{table_name}': {len(rows)} rows...")

            dst_columns = {c.name: c for c in dst_table.columns}

            cleaned_rows = []
            for row in rows:
                row_dict = dict(row)
                cleaned = {}
                for col_name, val in row_dict.items():
                    if col_name not in dst_columns:
                        continue
                    col_type = dst_columns[col_name].type

                    if val is None:
                        cleaned[col_name] = None
                    elif isinstance(col_type, Boolean):
                        cleaned[col_name] = bool(val)
                    elif isinstance(col_type, JSON):
                        if isinstance(val, str):
                            try:
                                cleaned[col_name] = json.loads(val)
                            except Exception:
                                cleaned[col_name] = val
                        else:
                            cleaned[col_name] = val
                    elif isinstance(col_type, DateTime):
                        if isinstance(val, str):
                            try:
                                cleaned[col_name] = datetime.fromisoformat(val)
                            except Exception:
                                cleaned[col_name] = val
                        else:
                            cleaned[col_name] = val
                    elif isinstance(col_type, Numeric):
                        if val is not None:
                            try:
                                cleaned[col_name] = Decimal(str(val))
                            except Exception:
                                cleaned[col_name] = val
                    else:
                        cleaned[col_name] = val
                cleaned_rows.append(cleaned)

            chunk_size = 100
            for i in range(0, len(cleaned_rows), chunk_size):
                chunk = cleaned_rows[i:i + chunk_size]
                dst_conn.execute(dst_table.insert(), chunk)
                dst_conn.commit()

            print(f"  -> Successfully migrated {len(cleaned_rows)} rows to '{table_name}'.")

        try:
            dst_conn.execute(text("SET session_replication_role = 'origin';"))
            dst_conn.commit()
            print("Session replication role restored to 'origin'.")
        except Exception as e:
            print(f"Note on resetting replication role: {e}")

    print("\nData migration to Supabase completed successfully!")

if __name__ == "__main__":
    migrate_data()

