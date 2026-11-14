# Google Ads Audit Checklist (Search / PMax / Demand Gen)

Mark each check Pass / Warning / Fail using the user's data. Category weights drive the
score. Critical fails hurt most. Quick wins are marked [QW].

| Category | Weight |
|----------|--------|
| Conversion tracking | 25% |
| Wasted spend / negatives | 20% |
| Account structure | 15% |
| Keywords & Quality Score | 15% |
| Ads & assets (incl. PMax/Demand Gen) | 15% |
| Settings & targeting | 10% |

## Conversion tracking (25%)  -- check FIRST
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| G42 | Primary conversion action defined | >=1 active / - / none |
| G43 | Enhanced Conversions enabled & verified [QW ~10% uplift] | active+verified / enabled not verified / off |
| G45 | Consent Mode v2 (Advanced) | advanced / basic only / not implemented |
| G46 | Conversion window matches sales cycle | 30-90d for B2B / default 30d unvalidated / mismatched |
| G47 | Only macro events set as Primary | Lead/Purchase only / some micro / all micro as primary |
| G48 | Data-Driven Attribution | DDA / last-click documented / legacy rule-based |
| G-CT1 | No duplicate counting (GA4 + native) | clean / - / both counting same action |
| G-CT2 | GA4 linked & flowing | linked clean / discrepancies / not linked |
| For SaaS | Offline conversion import (lead -> SQL/closed-won) | active / planned / none (optimizing for cheap leads) |

## Wasted spend / negatives (20%)
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| G13 | Search-term review recency | <=14d / <=30d / >30d |
| G14 | Themed negative lists (Competitor/Jobs/Free/Irrelevant) [QW] | >=3 lists / 1-2 / none |
| G15 | Negatives applied account/all-campaign | applied / some / none |
| G16 | Spend on irrelevant terms (30d) | <5% / 5-15% / >15% |
| G17 | Broad match paired with Smart Bidding [QW] | yes / - / Broad + Manual CPC (waste) |
| G-WS1 | Keywords >100 clicks, 0 conv | none / 1-3 / >3 |

## Account structure (15%)
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| G03 | Single-theme ad groups (<=10-15 kw) | tight / 11-20 / 20+ unrelated |
| G05 | Brand vs non-brand separated [QW] | separate / - / mixed |
| G06 | PMax present for eligible accounts | active / paused / none despite eligibility |
| G07 | Brand exclusions in PMax when brand Search exists | configured / partial / none |
| G08 | Top performers not budget-limited | eligible / minor cap / severely limited |
| G11 | Local geo = "People in" not "in or interested in" | correct / - / wrong |
| G12 | Display Network OFF on Search campaigns [QW] | off / - / on |

## Keywords & Quality Score (15%)
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| G20 | Avg Quality Score (impression-weighted) | >=7 / 5-6 / <=4 |
| G21 | Keywords with QS<=3 | <10% / 10-25% / >25% |
| G23 | Ad relevance "Below Average" | <20% / 20-35% / >35% |
| G24 | Landing page exp "Below Average" | <15% / 15-30% / >30% |
| G-KW2 | Headlines contain primary keyword variants | yes / partial / none |

## Ads & assets (15%)
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| G26 | >=1 RSA per ad group (2 better) | yes / 1 only / none |
| G27 | RSA headlines | >=8 (ideal 12-15) / 3-7 / <3 |
| G29 | RSA Ad Strength | Good/Excellent / Average / Poor |
| G31 | PMax asset density (>=20 img, 5 logo, 5 video) | dense / partial / sparse |
| G-PM3 | PMax brand cannibalization | <15% / 15-30% / >30% |
| G-PM6 | PMax campaign-level negatives [QW] | applied / account-only / none |
| G-DG1 | Demand Gen uses video + image | both / video only / none despite eligible |
| G-AD1 | New ad copy tested <90d | yes / - / >90d stale |

## Settings & targeting (10%)
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| G36 | Smart bidding on campaigns >=15 conv/30d | yes / partial or ECPC present / Manual CPC w/ data |
| G37 | Target CPA/ROAS within ~20% of historical | yes / 20-50% off / target <50% of actual |
| G50 | >=4 sitelinks per campaign [QW] | yes / 1-3 / none |
| G56 | Audience segments in Observation (remarketing/in-market) | applied / some / none |
| G57 | Customer Match uploaded, <30d fresh | yes / stale / none |
| G59 | Mobile LP speed (LCP) | <2.5s / 2.5-4s / >4s |

## Top quick wins
Enhanced Conversions (5m) - fix local geo to "People in" (2m) - build themed negative
lists (10m) - Broad+Manual -> Smart Bidding or Exact (5m) - disable Display on Search
(2m) - split brand into own campaign (10m) - add 4+ sitelinks (10m) - PMax campaign
negatives (10m).
