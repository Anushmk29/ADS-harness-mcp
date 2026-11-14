# Meta Ads Audit Checklist (Facebook / Instagram)

Mark each check Pass / Warning / Fail using the user's data. Category weights drive the
score. Critical fails hurt most. Quick wins are marked [QW].

| Category | Weight |
|----------|--------|
| Pixel / CAPI tracking health | 30% |
| Creative diversity & fatigue | 30% |
| Account structure | 20% |
| Audience & targeting | 20% |

## Tracking health (30%)  -- check FIRST; bad data invalidates everything below
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| M01 | Pixel installed & firing | All pages / >90% / not firing |
| M02 | Conversions API (CAPI) active [QW via CAPI Gateway] | Server events alongside pixel / planned / none (=30-40% data loss) |
| M03 | Event deduplication (event_id) | >=90% dedup / present but <90% / missing (double-count) |
| M04 | Event Match Quality (EMQ) | Purchase>=8.5, Lead>=6.5 / 6.0-7.9 / <6.0 |
| M05 | Domain verified in Business Manager [QW] | verified / - / not verified |
| M06 | Aggregated Event Measurement set | top events prioritized / not prioritized / not configured |
| M07 | Standard events (Lead/CompleteRegistration) used | standard / mixed / custom replacing standard |
| M09 | Attribution window 7-day click/1-day view [QW] | set / 1-day click only / not set |
| M10 | Event freshness (no >1hr lag) | real-time / <4hr / >4hr or intermittent |

## Creative diversity & fatigue (30%)  -- the #1 performance lever post-Andromeda
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| M25 | Format diversity (image+video+carousel) | >=3 formats / 2 / 1 only |
| M26 | Creative volume per ad set | >=5 (>=10 for Advantage+) / 3-4 / <3 |
| M27 | Vertical 9:16 video for Reels/Stories | present / only 1:1 or 4:5 / no video |
| M28 | Fatigue: CTR drop >20% over 14d while frequency>3 | none / 10-20% drop / >20% + freq>3 |
| M29 | Hook rate (first 3s skip) | <50% skip / 50-70% / >70% |
| M31 | UGC / social-native share | >=30% / 10-30% / <10% (all polished) |
| M-CR1 | Creative freshness (new test 14-21d) | <=21d / 21-45d / >45d |
| M-CR2 | Prospecting frequency (7d) | <3.0 / 3.0-5.0 / >5.0 (audience exhausted) |
| M-CR4 | CTR benchmark | >=1.0% / 0.5-1.0% / <0.5% |
| M-AN1 | Andromeda genuine diversity (<60% similarity) | distinct concepts/motivators / similar templates / minor variations only |

## Account structure (20%)
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| M11 | Campaign count (consolidated) | 1-3 / 4-5 / >5 (over-fragmented) |
| M12 | CBO vs ABO fit | CBO>$500/day, ABO for testing / mismatched but ok / CBO on <$100/day |
| M13 | Learning Limited ad sets | <30% / 30-50% / >50% |
| M16 | Audience overlap between ad sets | <20% / 20-30% / >30% |
| M17 | Budget per ad set | >=$10/day / $5-10 / <$5 |
| M18 | Objective matches goal (Leads/Sales) | aligned / - / mismatched (Traffic for leads) |
| M-ST1 | Budget >= 5x target CPA per ad set | >=5x / 2-5x / <2x |
| M36 | Bid strategy fit (Cost Cap for margin) | appropriate / - / Bid Cap below historical CPA |
| M39 | UTM parameters on all ads [QW] | all / some / none |

## Audience & targeting (20%)
| ID | Check | Pass / Warning / Fail |
|----|-------|----------------------|
| M20 | Website Custom Audience freshness | <180d / 180-365d / >365d or none |
| M21 | Lookalike source quality | >=1,000 high-value users / 500-1,000 / <500 or low-value |
| M23 | Exclude purchasers/customers from prospecting [QW] | excluded / partial / none |
| M24 | First-party data uploaded (Customer list) | uploaded + refreshed / stale / none |

## SaaS notes
- Optimize Meta toward your **highest-value event you can fire** (paid customer or SQL via
  CAPI), not raw trial signups - otherwise the algorithm finds cheap, low-quality leads.
- Build lookalikes from paid customers > trials > leads, in that priority.
- Retargeting (pricing visitors, trial-abandon) is almost always your best Meta ROI.

## Top quick wins
CAPI via Gateway (15m) - domain verify (5m) - 7d/1d attribution (2m) - exclude
customers from prospecting (10m) - add a video/carousel where only static exists (15m) -
campaign-level UTM template (5m).
