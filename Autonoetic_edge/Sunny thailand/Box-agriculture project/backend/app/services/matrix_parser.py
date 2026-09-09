import os
from typing import Dict, Any
import openpyxl

class MatrixOrderParser:
    """
    Streaming Matrix Order Parser for multi-client Excel sheets (e.g. Order Tonio FULL.xlsx).
    Discovers customer columns across multiple sheets and extracts product lines.
    """
    def __init__(self, file_path: str):
        self.file_path = file_path
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Order matrix file not found at: {file_path}")

    def parse_all_clients(self) -> Dict[str, Any]:
        wb = openpyxl.load_workbook(self.file_path, data_only=True)
        results = {
            "sheets_processed": [],
            "total_clients_found": 0,
            "clients_data": {}, # client_code -> list of items
            "products_catalog": {} # code -> info
        }

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            # Verify sheet has header row at Row 3
            if ws.max_row < 5 or ws.max_column < 6:
                continue

            results["sheets_processed"].append(sheet_name)

            # 1. Discover client columns (Row 3, Col 6 onwards)
            client_cols = {}
            for col in range(6, ws.max_column + 1):
                cell_val = ws.cell(3, col).value
                if cell_val and str(cell_val).strip() and not str(cell_val).startswith("#"):
                    client_code = str(cell_val).strip()
                    client_cols[col] = client_code
                    if client_code not in results["clients_data"]:
                        results["clients_data"][client_code] = []

            # 2. Extract product rows (Row 5 to max_row)
            for row in range(5, ws.max_row + 1):
                t_code = ws.cell(row, 1).value
                name_vi = ws.cell(row, 2).value
                name_en = ws.cell(row, 3).value
                name_th = ws.cell(row, 4).value
                pack_size = ws.cell(row, 5).value

                if not t_code and not name_vi and not name_en:
                    continue

                clean_code = str(t_code).strip() if t_code else ""
                clean_vi = str(name_vi).strip() if name_vi else ""
                clean_en = str(name_en).strip() if name_en else ""
                clean_th = str(name_th).strip() if name_th else ""
                clean_pack = str(pack_size).strip() if pack_size else "100g"

                if clean_code and clean_code not in results["products_catalog"]:
                    results["products_catalog"][clean_code] = {
                        "code": clean_code,
                        "name_vi": clean_vi,
                        "name_en": clean_en,
                        "name_th": clean_th,
                        "pack_size": clean_pack
                    }

                # 3. Check quantities for each discovered client in this row
                for col, client_code in client_cols.items():
                    qty_val = ws.cell(row, col).value
                    if qty_val is not None:
                        try:
                            # Parse numeric quantity
                            qty = float(qty_val)
                            if qty > 0:
                                results["clients_data"][client_code].append({
                                    "sheet": sheet_name,
                                    "t_code": clean_code,
                                    "name_vi": clean_vi,
                                    "name_en": clean_en,
                                    "name_th": clean_th,
                                    "pack_size": clean_pack,
                                    "quantity": qty
                                })
                        except (ValueError, TypeError):
                            pass

        results["total_clients_found"] = len(results["clients_data"])
        return results

    def inspect_sub_customers(self) -> Dict[str, Any]:
        """
        Fast lightweight inspection to immediately discover sub-customers on file upload.
        Enables instant Intake & Acknowledgment for human verification.
        """
        wb = openpyxl.load_workbook(self.file_path, read_only=True, data_only=True)
        sheets_processed = []
        unique_clients = {}

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            # Read row 3 to find client columns
            client_count_in_sheet = 0
            for row in ws.iter_rows(min_row=3, max_row=3, values_only=True):
                for col_idx, cell_val in enumerate(row[5:], start=6):
                    if cell_val and str(cell_val).strip() and not str(cell_val).startswith("#"):
                        client_code = str(cell_val).strip()
                        client_count_in_sheet += 1
                        if client_code not in unique_clients:
                            unique_clients[client_code] = {"client_code": client_code, "sheets": [sheet_name]}
                        elif sheet_name not in unique_clients[client_code]["sheets"]:
                            unique_clients[client_code]["sheets"].append(sheet_name)
                break

            if client_count_in_sheet > 0:
                sheets_processed.append({
                    "sheet_name": sheet_name,
                    "sub_customer_count": client_count_in_sheet
                })

        wb.close()
        return {
            "sheets_processed": sheets_processed,
            "total_sub_customers": len(unique_clients),
            "sub_customer_codes": sorted(list(unique_clients.keys())),
            "sub_customer_details": list(unique_clients.values()),
            "status": "ACKNOWLEDGED_PENDING_VERIFICATION"
        }
