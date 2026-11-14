# Knowledge router (read this first)

Everything in `knowledge/` is guidance: markdown the model reads. Nothing here executes.
Read a file with `skill_knowledge` and `input.path` relative to this folder, e.g. `ads/ppc-math.md`.
Harnesses that load skill folders can also load `creative/` directly (it has its own `SKILL.md`).

## Tools vs knowledge: which to call

1. **A tool or `skill_*` capability does the work.** Tools read accounts, validate drafts, run reports and prepare launches; `skill_*` capabilities report, research and record learnings. If one exists for the task, call it. Knowledge steers what you pass in and how you judge what comes back. It never replaces the call.
2. **Knowledge is read before the tool, not instead of it.** Read the files for your task (table below), then discover and run the tool.
3. **Safety rules live in code and cannot be overridden by any page.** Approvals, paused-first creation, validateOnly and no retry on uncertain writes all come from the tools. If a page says "just pause it" or "scale 3x", that is still a proposal (`ads_create_recommendation`), never a direct write.
4. **Account evidence beats every page.** Pages give thresholds; real account data decides. Never quote a page number as if it were the account's number.
5. **Pages are general; `skill_learnings` is ours.** Before planning, run `skill_learnings` `list` for what we already know works or failed. After publishing or deciding, record the outcome there (`ops/learning-loop.md`).

## Which files for which task

| Task | Read, in this order | Then call |
|---|---|---|
| Any Meta or Google ads task | `ads/our-business-fit.md` (always first; it settles the conflicts below) | `skill_learnings` `list` |
| Plan or restructure Meta campaigns | `ads/meta-campaign-structures.md`, `ads/meta-analyze-optimize-scale.md` | `meta_ads_readiness`, `meta_ads_validate_campaign`, `meta_ads_prepare_launch` |
| Plan Google Search campaigns | `ads/b2b-paid-playbook.md` | `google_ads_readiness`, `google_ads_validate_search_campaign` |
| Should we wait / scale / pause / edit? | `ads/meta-analyze-optimize-scale.md`, `ads/ppc-math.md` | account read tools, then `ads_create_recommendation` |
| Audit an account and score it | `ads/meta-audit-checklist.md` or `ads/google-audit-checklist.md` | read tools; `ga4_tracking_audit` for tracking checks |
| Budget, CPA, ROAS, break-even, A/B test sizing | `ads/ppc-math.md` | — |
| Competitor ads research | `ads/competitor-intel.md` | `skill_competitor_analysis` |
| Write a performance report | `ads/report-template.md` | `skill_performance_reporting`, `ga4_report_templates` |
| Ad copy, ad creative, creative brief | `creative/SKILL.md`, then `ads/creative-and-copy.md` (angles, Meta and RSA character limits) | `meta_ads_validate_campaign` / `google_ads_validate_search_campaign` check the copy |
| Ad image or video ad | `creative/SKILL.md` section 5 and the `creative/sources/` files it names | — |
| Final check on any ad copy | `creative/SKILL.md` section 6 (the gate) | — |
| Something got worse (cost per lead, lead quality, bookings, reach) | `ops/diagnose.md`, then `ads/our-business-fit.md` for thresholds | read tools, then `ads_create_recommendation` |
| Review an offer, landing page or campaign brief | `ops/review-panel.md` | — |
| Record results, learnings or run the weekly retro | `ops/learning-loop.md` | `skill_learnings` |

Paths inside `creative/SKILL.md` (e.g. `sources/copywriting/...`) are relative to `creative/`, so prefix them with `creative/`.

## When files disagree, the higher one wins

1. Tool rules and approvals (code).
2. The account's own data.
3. `ads/our-business-fit.md`: the team's decisions for this business, including the "Where the pages disagree" table.
4. `ads/meta-*.md`: team-chosen Meta research (written for e-commerce; our-business-fit adapts it).
5. The other `ads/*.md` pages (ads-expert skill, US SaaS benchmarks), and the `ops/` method pages (adapted from show-me-the-money; see `SOURCES.md`).
6. `creative/sources/**`: condensed third-party skills, general advice only.

Specific overlaps:
- **Ad copy:** `creative/SKILL.md` decides the process (format, then framework, then hooks, then gate). `ads/creative-and-copy.md` supplies the angle buckets and platform limits. `creative/sources/ads-management` and `creative/sources/marketing-skills/ads.md` are background only. Their pause/scale rules are overridden by level 3.
- **Frameworks and hooks** appear in several sources with the same meaning. Use the table in `creative/SKILL.md` section 3.
- **Pause and kill rules** in `ops/diagnose.md` never override `ads/our-business-fit.md`.

## State files

Results and learnings live in `skill_learnings`, not in files here.
`creative/layout-ledger.json` and `creative/format-library.starter.json` are templates showing the shape. The harness does not track layouts yet. If variety across pieces matters, ask the operator which layouts and hooks were used for the last five ads.

## After the task

End with the single next step and why it follows from the result (`ops/learning-loop.md`, last section).

## Where this came from

`SOURCES.md` lists every upstream source, the version we took, its licence, and what we skipped. Check it before refreshing any page from upstream.
