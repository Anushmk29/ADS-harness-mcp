# How the research applies to Pratap AI (read this first)

**Status: DRAFT — the team must confirm or correct this page.**

The other playbook pages are written for e-commerce stores (purchases, $30–50 order values, product catalogs).
Pratap AI sells high-ticket B2B services (₹3–3.5L projects, see `config/business.yaml`) and Meta ads produce **leads**, not purchases.
Apply the research like this:

## Use as written
- **Time windows:** 3 days is for early signals only (CTR, first lead costs). Never recommend a change on less than 7 days of data.
- **Do nothing first:** before recommending a change, name what changed (external: CPMs, competitors, season; internal: fatigue, frequency) and whether waiting another 7 days is the better call.
- **Do not pause the top-spending ad** because its cost per lead looks worse than a low-spend ad.
- **Scale in 20–25% steps**, only after a stable week at target, then wait another week.
- **Separate cold (top-of-funnel video) and warm (bottom-of-funnel static) ads into different ad sets.**
- **ABO** for small retargeting audiences and fair creative tests. **CBO** only for proven winners; leave it untouched for 7 days after launch or edit.
- **Refresh creative when frequency rises and results fall**; new concepts, not small tweaks.

## Adjust for lead generation
- **Judge ads on qualified leads and booked calls, not raw leads.** Our sales cycle is weeks long (see "High-Ticket Offers" in `meta-analyze-optimize-scale`), so decisions about which ads bring *customers* need 14+ days and CRM data.
- **Forced minimum spend tests:** set the minimum at about 1× the target cost per qualified lead (the guide uses 1× order value).
- **Learning phase needs ~50 conversions per ad set per week.** At our lead volume, keep ad sets few (2–3) and consolidate rather than split.
- **"Returning customer revenue"** does not apply; the equivalent is re-engaging old leads through email/WhatsApp, not changing ads.

## Do not recommend (does not fit this business or budget)
- **ASC (Advantage+ Shopping):** needs a product catalog and 50+ purchases/week.
- **Omni:** needs 20+ new ads per month and six-figure daily spend.
- **Duplication scaling** and **1-5-5 at full size:** meant for $200+/day per ad set and $1,000+/day accounts.

## Audit, math, copy and report pages (from the ads-expert skill)
`meta-audit-checklist`, `google-audit-checklist`, `ppc-math`, `creative-and-copy`, `competitor-intel`, `b2b-paid-playbook` and `report-template` are written for self-serve SaaS in USD.
- **Use as written:** the check IDs, Pass/Warning/Fail thresholds, category weights, A–F grading, no Broad match without Smart Bidding (enforced by `google_ads_validate_search_campaign`), no edits during learning, verify tracking before trusting CPA, the formulas and the report layout.
- **Swap "trial" for "qualified lead / booked call"** everywhere. `Cost per SQL = Lead CPA / (lead→SQL rate)` is the number that matters here.
- **Do not quote the USD benchmark tables** (CPC, CPL $100–200, $5,000 minimum budget) as targets for us. Say they are US SaaS references and use our own numbers below once filled in.
- **Competitor spend:** the Meta Ad Library API only returns spend for political/issue ads and EU-delivered ads. Treat any competitor spend figure as a rough estimate.

## Where the pages disagree (this table wins)
**Status: DRAFT, proposed by the harness. The team must confirm.** Every action below is a proposal through `ads_create_recommendation`, never a direct change.

| Question | Pages say | Rule for us |
|---|---|---|
| When to pause an ad or ad set | ads-expert: CPA > 3× target → pause now; kill after 50 clicks or 1–2× CPA spend. `creative/.../optimization-playbook`: pause at 100 clicks, 0 conversions. Meta research: only after 7 days at forced minimum spend and over target; never the top spender. | 7 days of data first. Then propose a pause only if it spent ≥ 1× target cost per qualified lead with 0 qualified leads, or its cost per qualified lead is > 3× target. Never propose pausing the top-spending ad on cost per lead alone. Before 7 days, 3× target is a "watch" flag. |
| Minimum budget per ad set | ads-expert: ≥ 5× target CPA per day. ppc-math: 50 conversions/week ≈ 7× CPA per day. | At our cost per lead neither is realistic per ad set. Consolidate to 2–3 ad sets and flag "Learning Limited" as expected, not as a fault. |
| Creative refresh | ads-expert: every 14–21 days. Meta research: when frequency rises and results fall. | Check every 14 days; refresh only on the fatigue signal (frequency up and cost per lead up over 7+ days). New concepts, not tweaks. |
| Scaling | 20–25% steps (Meta research, ads-expert). ads-management: "ROAS > 4× scale aggressively". | 20–25% after a stable week at target, then wait a week. Ignore ROAS-based scaling rules: our Meta ads optimise for leads. |
| CBO vs ABO | ads-expert M12: CBO fails under $100/day. Meta research: CBO for proven winners. | ABO for tests and retargeting; CBO only for proven winners. Score M12 by that rule, not by the dollar thresholds. |
| Spend guardrails | Not covered by the ads pages. show-me-the-money's ops skill: warn at 120% of budget, critical at 150%; start new automations small. | Month-to-date spend > 120% of the pro-rated budget: flag it as a warning. Over 150%: critical, propose a pause of the overspending campaign. New automated rules or campaigns start at about 10% of the target volume or budget for 48h before a full rollout. |
| Benchmarks and targets | ads-expert USD SaaS tables; Meta research e-commerce figures. | Use only the numbers below. If one is TBD, say so and ask; don't borrow a benchmark. |

## Numbers the team still has to fill in
- Target cost per lead: _TBD_
- Target cost per qualified lead / booked call: _TBD_
- Monthly Meta budget: _TBD_
