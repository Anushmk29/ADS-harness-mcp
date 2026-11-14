# Campaign Architecture: Meta Ads — AI Automation Services
**Budget:** ₹200/day (Phase A) → ₹350–500/day (Phase B)
**Currency:** INR
**Phase A Campaigns:** 1
**Phase B Campaigns:** 2
**Naming Convention:** `META_[Objective]_[Audience]_[Geo]_[YYYYMM]`

---

## Phase A: Awareness (Weeks 1–4)

### Campaign 1: META_Aware_Broadcast_INDIA_202607

| Setting | Value | Rationale |
|---------|-------|-----------|
| Campaign Name | `META_Aware_Broadcast_INDIA_202607` | |
| Objective | Awareness (Link Clicks) | Cheap reach; builds retargeting pool |
| Campaign Budget Optimization | OFF (Ad Set Budget) | Only 1 ad set |
| Daily Budget (Ad Set) | ₹200/day | Full budget on one ad set |
| Bidding Strategy | Lowest Cost | No cap while building |
| Delivery Optimization | Automated (Advantage+) | |
| Attribution | 7-day click / 1-day view | Standard |
| Special Ad Category | OFF | AI services not restricted |

### Ad Set 1: Broad (Advantage+ Audience)

| Setting | Value |
|---------|-------|
| Ad Set Name | `Broad_AdvantagePlus` |
| Audience | Advantage+ Audience (ON) |
| Age | 25–55 |
| Location | [Your service cities] |
| Gender | All genders |
| Detailed Targeting | None (broad) |
| Detailed Targeting Expansion | ON |
| Exclusions | Employee list |
| Placements | Advantage+ Placements (all) |
| Frequency Cap | None |
| Daily Budget | ₹200/day |

### Ads (3 Creatives)

| Ad # | Name | Format | Concept | CTA |
|------|------|--------|---------|-----|
| 1 | `UGC_40HourProblem_HI` | Video 30s (9:16 + 1:1) | Pain point: ops manager drowning in manual work | "Learn More" |
| 2 | `Static_DidYouKnow` | Image (1080×1080) | Industry stat + problem hook | "Learn More" |
| 3 | `Video_60sDemo` | Video 60s (1:1 + 9:16) | Screen-record demo of an automation | "Watch More" |

> **Phase A CTA:** "Learn More" or "Watch More" — NOT "Book Now." You're building awareness, not selling yet. The CTA should be low-commitment.

---

## Phase B: Lead Gen + Retargeting (Weeks 5+)

### Campaign 2: META_Lead_Propecting_INDIA_202607

| Setting | Value | Rationale |
|---------|-------|-----------|
| Campaign Name | `META_Lead_Propecting_INDIA_202607` | |
| Objective | Leads | Optimizes for form submissions |
| Campaign Budget Optimization | OFF (Ad Set Budget) | 1 ad set |
| Daily Budget (Ad Set) | ₹200–250/day | Primary lead engine |
| Bidding Strategy | Lowest Cost | No cap while in learning |
| Delivery Optimization | Automated (Advantage+) | |
| Attribution | 7-day click / 1-day view | |

### Ad Set 1: Broad (Advantage+ Audience)

| Setting | Value |
|---------|-------|
| Ad Set Name | `Broad_AdvantagePlus` |
| Audience | Advantage+ Audience (ON) |
| Age | 25–55 |
| Location | [Your service cities] |
| Gender | All genders |
| Detailed Targeting | None (broad) |
| Detailed Targeting Expansion | ON |
| Exclusions | Phase A retargeting audience, existing customers, employees |
| Placements | Advantage+ Placements (all) |
| Frequency Cap | None |
| Daily Budget | ₹200–250/day |

### Ads (4 Creatives)

| Ad # | Name | Format | Concept | CTA |
|------|------|--------|---------|-----|
| 1 | `UGC_40HourProblem_HI` | Video 30s (9:16 + 1:1) | Pain point (carry over from Phase A) | "Book Free Audit" |
| 2 | `Static_ROIBreakdown` | Image (1080×1080) | Infographic: exact ₹ saved per month | "Get My ROI" |
| 3 | `Carousel_BeforeAfter` | Carousel (5 cards, 1080×1080) | Transformation: before vs. after | "See How" |
| 4 | `UGC_Testimonial_HI` | Video 30s (9:16) | Client testimonial | "Get Results" |

> **Phase B CTA:** "Book Now" / "Book Free Audit" / "Get Quote" — direct, action-oriented.

---

### Campaign 3: META_Conv_Retargeting_INDIA_202607

| Setting | Value | Rationale |
|---------|-------|-----------|
| Campaign Name | `META_Conv_Retargeting_INDIA_202607` | |
| Objective | Conversions (Website) | Optimize for "Book a Call" or "WhatsApp Click" |
| Campaign Budget Optimization | OFF | 1 ad set |
| Daily Budget (Ad Set) | ₹100–150/day | Retargeting needs less budget |
| Bidding Strategy | Lowest Cost | |
| Attribution | 7-day click / 1-day view | |

### Ad Set 1: Phase A Audience

| Setting | Value |
|---------|-------|
| Ad Set Name | `PhaseA_Audience_30d` |
| Audience | Custom Audience: Website visitors (30d) + Video 75% (14d) + FB/IG Engagers (60d) |
| Exclusions | Lead form submitters, existing customers |
| Placements | Advantage+ Placements |
| Frequency Cap | 10 impressions/week |
| Daily Budget | ₹100–150/day |

### Retargeting Ads (2)

| Ad # | Name | Format | Angle |
|------|------|--------|-------|
| 1 | `Video_DemoTeaser` | Video 15s (9:16) | "You watched. Now see it on YOUR business." |
| 2 | `Static_StillThinking` | Image (1080×1080) | "Still thinking? Here's what the 20 min looks like." |

> **Launch timing:** Campaign 3 goes live at the START of Phase B (Week 5), when Phase A has built a 2,000+ retargeting audience.

---

## Audience Structure Summary

### Phase A (Weeks 1–4)
```
┌─────────────────────────────────────┐
│  Broad Audience (Advantage+)        │
│  Age 25-55, [Your Cities]           │
│  No interest targeting              │
│  Exclusions: Employees              │
│                                     │
│  → Feeds:                           │
│    CA_Website_30d                   │
│    CA_Video_75pct_14d               │
│    CA_FBIG_Engage_60d               │
└─────────────────────────────────────┘
```

### Phase B (Weeks 5+)
```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│  Broad Audience (Advantage+)        │     │  Phase A Custom Audiences           │
│  Age 25-55, [Your Cities]           │     │  Website 30d + Video 14d + Engage   │
│  Exclusions: Phase A audience,      │     │  Exclusions: Lead submitters,       │
│    existing customers, employees    │     │    existing customers               │
│                                     │     │                                     │
│  → Campaign 2 (Lead Gen)           │     │  → Campaign 3 (Retargeting)         │
└─────────────────────────────────────┘     └─────────────────────────────────────┘
```

---

## Audience Overlap Management

| Pair | Expected Overlap | Action |
|------|-----------------|--------|
| Campaign 2 ↔ Campaign 3 | Low (retargeting excludes submitters) | Monitor; exclude lead submitters from prospecting |
| Campaign 3 Ad Set (multiple audiences) | Medium (video viewers may also be website visitors) | Acceptable; frequency caps protect |

**Rule:** If any two ad sets show >30% audience overlap in the Audience Overlap tool, consolidate or add exclusions.

---

## Learning Phase Management

| Metric | Target | Action if Missed |
|--------|--------|-----------------|
| Conversions per ad set per week | ≥7 (50 total to exit learning) | Increase budget 20% OR be patient (₹200/day = slower) |
| Ad sets in "Learning Limited" | <30% of total | Kill or consolidate |
| Budget per ad set vs. target CPL | ≥5x | If CPL target is ₹300, ad set budget should be ≥₹1,500/week (₹214/day) |

> **At ₹200/day on prospecting:** You'll get ~50 conversions in 3–6 weeks at ₹150–500 CPL. Learning phase exits by Week 6–8. This is acceptable.

> **At ₹250/day on prospecting:** ~50 conversions in 2–4 weeks. Faster optimization.

---

## Scaling Triggers

| Trigger | Action |
|---------|--------|
| CPL < ₹200 for 7 consecutive days | Increase prospecting budget +20% (₹200 → ₹240) |
| 50+ total conversions in ad set | Switch bidding to Cost Cap (set at 1.5x current CPL) |
| Creative CTR drops >20% over 14 days | Replace fatigued creative; launch backup concept |
| Frequency > 5.0 on prospecting (7-day) | Expand geo OR add new creative angle OR increase budget |
| Retargeting audience > 5,000 | Increase retargeting budget to ₹150/day |
| 3 consecutive weeks CPL improving | Add 1 new creative concept; consider ₹500/day total |
| Monthly spend > ₹15,000 with CPL < ₹200 | Add Google Search for high-intent queries |

---

## File Naming Convention Summary

```
Campaign:  META_[Objective]_[Audience]_[Geo]_[YYYYMM]
Ad Set:    [Audience Type]_[Window/Modifier]
Ad:        [Format]_[Concept]_[Language]

Examples:
  META_Aware_Broadcast_INDIA_202607
  META_Lead_Propecting_INDIA_202607
  META_Conv_Retargeting_INDIA_202607

  Broad_AdvantagePlus
  PhaseA_Audience_30d

  UGC_40HourProblem_HI
  Static_DidYouKnow
  Video_60sDemo
  Static_ROIBreakdown
  Carousel_BeforeAfter
  UGC_Testimonial_HI
  Video_DemoTeaser
  Static_StillThinking
```

---

## What to Add in Phase B+ (If Performance Justifies)

| Addition | Budget Impact | Trigger |
|----------|--------------|---------|
| Second prospecting ad set (lookalike 1% of leads) | +₹50–100/day | 100+ leads collected |
| WhatsApp Click-to-Chat campaign | +₹50/day | You have WhatsApp Business API |
| Collection ad (if you have 5+ service offerings) | +₹50/day | Service catalog ready |
| Dynamic Creative (test 3 headlines × 2 images) | Included in existing ad set | After 2 weeks of Phase B data |
| A/B Test: Instant Form vs. Website conversion | Split 50/50 budget | After 50+ leads from each |
| Hindi-only ad set (if Hindi outperforms English) | +₹50/day | Data shows Hindi CTR > English by 30%+ |
