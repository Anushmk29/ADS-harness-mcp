import difflib
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from app.models.master_data import Product, ClientSkuMapping

class NameFirstMatcher:
    def __init__(self, db: Session):
        self.db = db
        self.products = db.query(Product).all()
        # Precompute lookup tables
        self.exact_vi = {}
        self.exact_en = {}
        self.exact_th = {}
        self.exact_code = {}
        for p in self.products:
            if p.name_vi: self.exact_vi[p.name_vi.strip().lower()] = p
            if p.name_en: self.exact_en[p.name_en.strip().lower()] = p
            if p.name_th: self.exact_th[p.name_th.strip().lower()] = p
            if p.t_code: self.exact_code[p.t_code.strip().upper()] = p
            if p.numeric_code: self.exact_code[p.numeric_code.strip()] = p

        # Load pre-fed standardized client SKU mappings
        self.client_sku_by_code = {} # (main_cust_id or 'GLOBAL', code) -> Product
        self.client_sku_by_name = {} # (main_cust_id or 'GLOBAL', name) -> Product
        all_mappings = db.query(ClientSkuMapping).filter(ClientSkuMapping.is_verified == True).all()
        for m in all_mappings:
            cust_key = m.main_customer_id or "GLOBAL"
            if m.client_sku_code:
                self.client_sku_by_code[(cust_key, m.client_sku_code.strip().upper())] = m.product
                self.client_sku_by_code[("GLOBAL", m.client_sku_code.strip().upper())] = m.product
            if m.client_raw_name:
                self.client_sku_by_name[(cust_key, m.client_raw_name.strip().lower())] = m.product
                self.client_sku_by_name[("GLOBAL", m.client_raw_name.strip().lower())] = m.product

        # Trade alias dictionary
        self.aliases = {
            "water spinach": "morning glory",
            "rau muống": "morning glory",
            "ผักบุ้ง": "morning glory",
            "cha om": "acacia leaf",
            "chà ôm": "acacia leaf",
            "ชะอม": "acacia leaf",
            "kaempfer": "krachai",
            "krachai": "krachai",
            "củ ngải": "krachai",
            "white round eggplant": "cà sọc",
            "small green eggplant": "cà nút áo",
            "thai banana": "gối chuối",
        }

    def resolve_product(
        self,
        raw_name: str,
        raw_code: Optional[str] = None,
        language_hint: Optional[str] = None,
        main_customer_id: Optional[str] = None
    ) -> Tuple[Optional[Product], str, float]:
        """
        6-Tier SKU Standardization Hierarchy
        Tier 0: Pre-Fed Standardized Client SKU Database (Client-specific & Global)
        Tier 1: Exact Master Product Match (VI, EN, TH)
        Tier 2: Trade Alias Match
        Tier 3: Fuzzy Similarity Match (>= 85%)
        Tier 4: Product Code Fallback
        Tier 5: Unresolved
        Returns: (Product, match_tier, confidence_score)
        """
        cust_key = main_customer_id or "GLOBAL"

        # Tier 0: Check Pre-fed Client SKU Database (eliminates typos and duplicate entries)
        if raw_code and raw_code.strip():
            clean_code = raw_code.strip().upper()
            if (cust_key, clean_code) in self.client_sku_by_code:
                return self.client_sku_by_code[(cust_key, clean_code)], "PRE_FED_CLIENT_SKU", 1.0
            if ("GLOBAL", clean_code) in self.client_sku_by_code:
                return self.client_sku_by_code[("GLOBAL", clean_code)], "PRE_FED_CLIENT_SKU", 1.0

        clean = raw_name.strip().lower() if raw_name else ""
        if clean:
            if (cust_key, clean) in self.client_sku_by_name:
                return self.client_sku_by_name[(cust_key, clean)], "PRE_FED_CLIENT_SKU", 1.0
            if ("GLOBAL", clean) in self.client_sku_by_name:
                return self.client_sku_by_name[("GLOBAL", clean)], "PRE_FED_CLIENT_SKU", 1.0

        if not raw_name:
            if raw_code and raw_code.strip().upper() in self.exact_code:
                return self.exact_code[raw_code.strip().upper()], "CODE_FALLBACK", 0.75
            return None, "UNRESOLVED", 0.0

        # Tier 1: Exact Match (VI, EN, TH)
        if clean in self.exact_vi:
            return self.exact_vi[clean], "NAME_EXACT_VI", 1.0
        if clean in self.exact_en:
            return self.exact_en[clean], "NAME_EXACT_EN", 1.0
        if clean in self.exact_th:
            return self.exact_th[clean], "NAME_EXACT_TH", 1.0

        # Tier 2: Trade Alias Match
        alias_target = self.aliases.get(clean)
        if alias_target:
            if alias_target in self.exact_en:
                return self.exact_en[alias_target], "NAME_ALIAS", 0.95
            if alias_target in self.exact_vi:
                return self.exact_vi[alias_target], "NAME_ALIAS", 0.95

        # Tier 3: Fuzzy Similarity Match (>= 85%)
        # Check against English names
        all_en_names = list(self.exact_en.keys())
        close_en = difflib.get_close_matches(clean, all_en_names, n=1, cutoff=0.85)
        if close_en:
            ratio = difflib.SequenceMatcher(None, clean, close_en[0]).ratio()
            return self.exact_en[close_en[0]], "NAME_FUZZY", round(ratio, 2)

        # Check against Vietnamese names
        all_vi_names = list(self.exact_vi.keys())
        close_vi = difflib.get_close_matches(clean, all_vi_names, n=1, cutoff=0.85)
        if close_vi:
            ratio = difflib.SequenceMatcher(None, clean, close_vi[0]).ratio()
            return self.exact_vi[close_vi[0]], "NAME_FUZZY", round(ratio, 2)

        # Tier 4: Code Fallback (Only if name unmatched)
        if raw_code and raw_code.strip().upper() in self.exact_code:
            return self.exact_code[raw_code.strip().upper()], "CODE_FALLBACK", 0.75

        return None, "UNRESOLVED", 0.0

    def add_sku_mapping(
        self,
        product_id: str,
        client_raw_name: str,
        client_sku_code: Optional[str] = None,
        main_customer_id: Optional[str] = None,
        pack_size: Optional[str] = None
    ) -> ClientSkuMapping:
        """Saves a verified client mapping into the standardized SKU database for future persistence."""
        mapping = ClientSkuMapping(
            main_customer_id=main_customer_id,
            client_sku_code=client_sku_code.strip().upper() if client_sku_code else None,
            client_raw_name=client_raw_name.strip(),
            product_id=product_id,
            standard_pack_size=pack_size,
            is_verified=True
        )
        self.db.add(mapping)
        self.db.commit()
        self.db.refresh(mapping)
        return mapping
