import os
import sqlite3
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.core.database import Base, engine


def migrate():
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    print(f"Migrating SQLite DB at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    def add_col(tbl, col, defn):
        try:
            cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} {defn}")
            print(f"  + Added {tbl}.{col}")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                pass
            else:
                print(f"  - Note on {tbl}.{col}: {e}")

    add_col("customers", "is_main_customer", "BOOLEAN DEFAULT 0")
    add_col("customers", "parent_customer_id", "VARCHAR(36)")
    add_col("products", "default_buffer_percentage", "DECIMAL(5, 2) DEFAULT 0.00")
    add_col("products", "botanical_family", "VARCHAR(128)")
    add_col("raw_order_files", "main_customer_id", "VARCHAR(36)")
    add_col("raw_order_files", "detected_sub_customer_count", "INTEGER DEFAULT 0")
    add_col("raw_order_files", "acknowledgment_summary", "JSON")
    add_col("client_orders", "main_customer_id", "VARCHAR(36)")
    add_col("purchasing_items", "ordered_net_weight_kg", "DECIMAL(10, 2) DEFAULT 0.00")
    add_col("purchasing_items", "buffer_percentage", "DECIMAL(5, 2) DEFAULT 0.00")
    add_col("purchasing_items", "buffer_weight_kg", "DECIMAL(10, 2) DEFAULT 0.00")
    add_col("master_purchasing_lists", "shipment_date", "VARCHAR(10)")
    add_col("master_purchasing_lists", "route_code", "VARCHAR(32)")
    add_col("boxes", "override_box_catalogue_id", "VARCHAR(36)")
    add_col("boxes", "custom_length_cm", "DECIMAL(6, 2)")
    add_col("boxes", "custom_width_cm", "DECIMAL(6, 2)")
    add_col("boxes", "custom_height_cm", "DECIMAL(6, 2)")
    add_col("boxes", "volumetric_weight_kg", "DECIMAL(8, 2)")
    add_col("boxes", "chargeable_weight_kg", "DECIMAL(8, 2)")
    add_col("boxes", "is_manually_overridden", "BOOLEAN DEFAULT 0")
    add_col("boxes", "override_reason", "TEXT")
    add_col("invoices", "invoice_type", "VARCHAR(32) DEFAULT 'ON_BEHALF_SUB_CUSTOMER'")
    add_col("invoices", "seller_customer_id", "VARCHAR(36)")
    add_col("invoices", "internal_notes", "TEXT")
    add_col("products", "default_unit_volume_cm3", "DECIMAL(10, 2) DEFAULT 1000.00")
    add_col("client_order_items", "confirmed_pack_count", "INTEGER")
    add_col("client_order_items", "confirmed_net_weight_kg", "DECIMAL(10, 2)")
    add_col("receipts", "internal_notes", "TEXT")
    add_col("receipts", "payload_sha256", "VARCHAR(64)")
    add_col("payment_transactions", "payment_mode", "VARCHAR(32) DEFAULT 'BANK_TRANSFER'")

    conn.commit()
    conn.close()

    # Create any missing new tables
    Base.metadata.create_all(bind=engine)
    print("Database schema migration completed successfully!")


if __name__ == "__main__":
    migrate()
