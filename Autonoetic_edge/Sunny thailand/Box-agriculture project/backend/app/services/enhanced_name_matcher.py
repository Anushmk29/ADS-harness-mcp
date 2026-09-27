import re
from typing import Any
from sqlalchemy.orm import Session

from app.models.master_data import ClientSkuMapping, ControlStatus, Product
from app.services.name_matcher import NameFirstMatcher


class EnhancedNameMatcher(NameFirstMatcher):
    """
    Enhanced Multi-Lingual & Colloquial Agricultural Produce Matcher.
    Extends NameFirstMatcher with:
      - European & French trade names (Paris Store / Alindar)
      - Scandinavian / Norwegian produce names (NGA Norway)
      - Colloquial Thai terms from WhatsApp/LINE chats (street food, cuts, coconuts)
      - Suffix/Prefix code normalization (e.g. 11001-080 -> 11001, 11-001 -> 11001)
    """

    def __init__(self, db: Session):
        super().__init__(db)
        self._inject_enhanced_aliases()

    def _inject_enhanced_aliases(self):
        """Pre-seeds comprehensive multi-lingual agricultural trade aliases."""
        enhanced = {
            # --- French Produce Names (ALINDAR / Paris Store) ---
            "pousse de bamboo": "bamboo shoot",
            "pousse de bamboo frais": "bamboo shoot",
            "feuille tito": "tito leaf",
            "feuille diep": "fish mint",
            "piment vert": "green chilli",
            "bong he": "chives flower",
            "ngo gai": "culantro",
            "galanga": "young galangal",
            "curcuma": "yellow turmeric",
            "gian dai": "krachai",
            "aubergine blanche": "white round eggplant",
            "petit aubergine": "pea eggplant",
            "feuille parfumee": "pandan leave",
            "feuille de betel": "betel leave",
            "tamarin vert": "young sour tamarind",
            "feuille de banane": "banana leave",
            "ciboulette": "spring onion",
            "papaye": "green papaya",
            "feuille yanan": "yanang leave",
            "feuille saom": "acacia leaf",
            "feuille ylot": "chaplu leaf",
            "liseron d'eau": "morning glory",
            "epis de mais": "baby corn",
            "feuille he": "chinese leek leave",
            "piment rouge": "red chilli",
            "tigre de lotus": "lotus stem",
            "tigre ma-uk": "kayang leaf",
            "herbe rao ram": "pak prawe",
            "fleur dok sa-no": "sesbania flower",

            # --- Norwegian & Nordic Variations (NGA) ---
            "grønn papaya": "green papaya",
            "sitron gress": "lemongrass",
            "thaigress": "lemongrass",

            # --- Colloquial Thai Street Food & Chat Produce ---
            "ปลาระเบิด": "look chin pla",
            "ลูกชิ้นปลาระเบิด": "look chin pla",
            "ไส้กรอกแหลม": "kai sausage",
            "ไส้กรอกแหลมทอง": "kai sausage",
            "โกเด้งหมู": "look chin moo",
            "โกเด้งเนื้อ": "look chin neur",
            "มะพร้าวเจีย": "young coconut",
            "มะพร้าว ทึมทึก": "mature coconut",
            "มะพร้าวทึนทึก": "mature coconut",
            "มะพร้าวอ่อน": "young coconut",
            "ลอดช่อง": "short vermicelli",
            "ลอดช่องไทย": "short vermicelli",
            "หมี่เหลืองไข่": "egg noodles",
            "น้อยหน่า": "sugar apple",
            "ลูกเนียงแกะเปลือก": "luk niang",
            "ลูกเนียง": "luk niang",
            "กระเทียมไทย": "garlic",
            "กระชายซอย": "krachai",
            "ใบมะกรูดสด": "leech lime leaf",
            "ข่าอ่อน": "young galangal",
            "ผักบุ้งจีน": "morning glory",
            "ตะไคร้": "lemongrass",
        }
        self.aliases.update(enhanced)

    def match_item(
        self,
        raw_text: str,
        declared_code: str | None = None,
        main_customer_id: str | None = None,
    ) -> tuple[Product | None, str, float]:
        """
        Multi-tier matching pipeline:
          1. Cleaned explicit code (e.g. '11-001' or '11001-080' -> '11001')
          2. Client SKU Mapping (Exact code / alias)
          3. Exact Name lookup (TH / EN / VI)
          4. Enhanced trade alias dictionary
          5. Fuzzy similarity match
        """
        # --- Tier 1: Cleaned Code Matching ---
        if declared_code:
            code_clean = declared_code.strip().upper()
            # Normalize e.g. '11-001' -> '11001' or '11001-080' -> '11001'
            if code_clean in self.exact_code:
                return self.exact_code[code_clean], "CODE_EXACT", 1.0

            normalized_num = re.sub(r"[^\w]", "", code_clean)
            if normalized_num in self.exact_code:
                return self.exact_code[normalized_num], "CODE_NORMALIZED", 0.99

            # Check suffix split e.g. 11001-080 -> 11001
            base_code = code_clean.split("-")[0]
            if base_code in self.exact_code:
                return self.exact_code[base_code], "CODE_PREFIX", 0.98

        # --- Tier 2: Super class resolve_product ---
        prod, method, score = self.resolve_product(
            raw_name=raw_text,
            raw_code=declared_code,
            main_customer_id=main_customer_id,
        )
        if prod:
            return prod, method, score

        # --- Tier 3: Keyword / Token Matching in Thai & English ---
        clean_text = raw_text.strip().lower()
        for alias_key, target in self.aliases.items():
            if alias_key in clean_text:
                matched_prod, m_method, m_score = self.resolve_product(
                    raw_name=target,
                    raw_code=None,
                    main_customer_id=main_customer_id,
                )
                if matched_prod:
                    return matched_prod, f"ENHANCED_ALIAS_{alias_key}", 0.90

        # Fallback partial scan of product names
        for p in self.products:
            if p.name_th and p.name_th.lower() in clean_text:
                return p, "THAI_PARTIAL", 0.80
            if p.name_en and p.name_en.lower() in clean_text:
                return p, "ENG_PARTIAL", 0.80

        return None, "NO_MATCH", 0.0
