# SaaS / B2B Paid Advertising Playbook (Meta + Google)

## Industry characteristics
- Long sales cycles, multiple touchpoints (30-90+ days).
- Free trial or demo request is the primary conversion; pipeline/revenue is the real KPI.
- High LTV justifies high CPA ($100-$200+).
- Heavy comparison shopping - competitor keyword bidding and comparison content matter.
- Self-serve (low-touch) vs sales-assisted (high-touch) paths behave very differently.

## Recommended platform mix (Meta + Google focus)
| Platform | Role | Budget % | Why |
|----------|------|----------|-----|
| Google Search | Primary | 45-60% | Capture high-intent trial/demo/pricing/competitor queries |
| Google PMax/Demand Gen | Secondary | 10-20% | Scaled prospecting once conversion data is solid (30+/mo) |
| Meta prospecting | Secondary | 15-25% | Lookalikes + interest/role targeting for problem-aware demand |
| Meta retargeting | Always-on | 10-15% | Pricing-page + trial-abandon + content visitors (highest ROI) |

(If you later add LinkedIn, it becomes a primary B2B channel for ABM and job-title targeting.)

## Campaign architecture
```
Google
  Brand Defense        -> brand terms + "[competitor] vs" terms (cheap, defends against poachers)
  Non-Brand High Intent-> "[category] software/tool/platform", "best [category]", pricing/comparison
  Competitor           -> "[competitor] alternative", "switch from [competitor]"
  Problem/Mid Intent   -> "how to [solve problem]", "[workflow] automation"
  PMax / Demand Gen    -> scaled prospecting with brand exclusions ON
Meta
  Prospecting (ABO test -> CBO scale) -> lookalikes (high-value events) + broad/Advantage+ audience
  Retargeting          -> pricing visitors (7d), trial-abandon (CRM), content visitors (30d)
```

## Targeting
- **Google keywords**: brand; high-intent ("[category] software", "best [category] tool");
  competitor ("[competitor] alternative/vs"); problem ("how to [problem]").
- **Meta audiences**: lookalikes from high-value events (paid customers > trials > leads);
  job-title/interest stacks for your ICP; broad + Advantage+ once the pixel has signal.
- **Exclusions (critical)**: existing customers (CRM list), current trials from prospecting,
  job seekers, students/interns, competitor employees.

## Bidding strategy by volume
| Platform | Monthly conv | Strategy |
|----------|--------------|----------|
| Google | <15 | Maximize Clicks (CPC cap) while you gather data |
| Google | 15-29 | Maximize Conversions |
| Google | 30+ | Target CPA (recommended for SaaS) |
| Google | 50+ w/ pipeline values | Target ROAS |
| Meta | default | Lowest Cost (volume) |
| Meta | margin priority | Cost Cap |

## Benchmarks (SaaS - calibrate to your spend level)
| Metric | SaaS benchmark |
|--------|----------------|
| Google Search CPC | $4.50-$8.00 |
| Google Search CTR | ~4.3% |
| Google Search CVR | ~1.65% |
| Google CPL (trial/demo) | $100-$200 |
| Meta CPC | $1.50-$3.00 |
| Meta CPM | ~$35 |
| Min viable monthly budget | $5,000+ to run Google + Meta properly |

## KPI targets (ramp)
| Metric | Month 1 | Month 3 | Month 6 |
|--------|---------|---------|---------|
| Trial/Demo CPA | baseline | -30% | target |
| MQL -> SQL rate | baseline | +10% | +20% |
| Pipeline value | tracking | 3x spend | 5x spend |
| ROAS (pipeline) | tracking | 3:1 | 5:1 |
| Google Quality Score (wtd) | track | >=6 | >=7 |
| Meta EMQ (Purchase/Lead) | track | >=7.0 | >=8.5 |

## Common pitfalls (SaaS)
- Optimizing for trial signups without tracking trial->paid (vanity metric).
- Not excluding existing customers / active trials from prospecting.
- Broad match without Smart Bidding (budget waste).
- Letting competitors bid your brand unopposed.
- One landing page for all funnel stages (demo page getting cold awareness traffic).
- No offline conversion import (Google) / no CAPI lead-quality signal (Meta) -> the
  algorithm optimizes for cheap leads, not good ones.
