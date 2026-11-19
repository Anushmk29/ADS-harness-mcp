# Changelog

Newest first. Every change to tools, skills or `knowledge/` gets a line here. Refreshes of upstream guidance also update `knowledge/SOURCES.md`.

## 2026-11-20: rules-based reviews, client reports, real competitor data
Goal: the weekly loop (findings, next steps, client report) runs without Claude; a cheap model is optional and only words the report.
- **Removed fake research.** Deleted the hard-coded `web-research-mcp` results, `skill_market_research`, `skill_competitor_analysis`, the Laya relevance filter and the template-skill (`live: false`) mechanism that only existed for them.
- **Goal per client.** `ads-module.yaml` takes `goal: lead | purchase` and `targets: { cpa, roas }`. The KPI snapshot now stores Meta purchases and purchase revenue (and Google `conversions_value`); Google conversions count toward the goal metric. Reports and the fatigue check use the goal metric; daily ratios (CPL/ROAS) are no longer summed across days.
- **Findings engine** (`modules/ads/findings.ts`, MCP tool `ads_findings`): ~15 fixed rules over the last 7 days vs the 7 before: 3x kill rule, cost vs target and trend, ROAS vs target, winners, spend concentration, learning limited, audience saturation, underspend, creative fatigue, weak CTR, CPM spike, broken or dropped tracking, and "not enough data, wait". Falls back to the account's own baseline cost when no target is set.
- **Action ranker** (`modules/ads/actions.ts`): turns findings into ranked pause / ±20% budget / manual steps. The new `ads-review-weekly` job (Mon 07:45) submits the top writes for approval through the normal gates; when tracking looks broken only the tracking check is proposed. Approval cards explain why.
- **Client report**: findings, next steps, spend by campaign, target status and a narrative. Template wording always builds; with a model configured, `writeNarrative` rewrites it and rejects any text containing a number not in the data. New printable, white-labelled page at `/api/console/reports/<id>/html` (`REPORT_BRAND_NAME`, `REPORT_LOGO_URL`, `REPORT_ACCENT`).
- **Competitor ads** (`skill_competitor_ads`, `competitor-watch-weekly` job): real Meta Ad Library ads via Apify (`COMPETITOR_API_KEY`); longest-running ads, formats, CTAs and offers computed in code; weekly snapshots report new ads; model-named angles must cite real ad IDs. No key = an error, never sample data.
- **Onboarding**: `doctor` checks ads targets, pixel last-fired (live), the Apify key, LLM fallback and budget; a missing LLM is now a warning. New `cli.js job <name>` runs any scheduled job now.

## 2026-11-15: audit fixes
- Closed numeric activation and scheduled-budget ceiling bypasses, including Google's alternate money field names. Multiplier budget schedules require an effective amount check and are currently refused.
- Made native dashboard startup local by default; restricted first-admin onboarding; rejected prototype-pollution keys in settings; stopped trusting client-supplied forwarding headers for login throttling.
- Fixed Google customer-action URLs, token expiry/refresh coordination, and GA4 realtime request bodies.
- Moved learnings to transactional `learnings.sqlite`, importing older JSON records without replacing newer database updates; read-only department calls no longer rewrite memory snapshots.
- Fixed duplicate scheduled-job claims and dashboard totals counting combined rows twice. Daily snapshots now confirm account currencies and persist a single tracking currency across restarts.
- Meta launch recovery now carries forward the latest partial continuation's object IDs and blocks competing continuations of the same source.
- Reports now carry confirmed currency and expose `totalMarketingSpend`, `googleConversions`, and `metaLeads`. Removed misleading USD field names; unlike conversion counts are kept separate instead of added. Added regression tests for all fourteen audit findings.

## 2026-11-14: project navigation
- Grouped human-facing documentation into guides, architecture, plans, campaigns and history; added a documentation index and source map.
- Grouped tests by application area, updated their imports and the MCP smoke script path, and added a testing guide.
- Replaced the root README with setup links, everyday commands and a folder map; retained the original overview in `docs/history/original-overview.md`.
- Application source paths, CLI entrypoints, configuration and runtime data locations are unchanged.

## 2026-10-13: harness is ads-only
### Removed (moved to `../marketing-harness-removed-content-2026-10-13/`, restorable; full backup in `../marketing-harness-backup-2026-10-13-before-content-removal.tgz`)
- The organic content module `src/modules/content` (content/blog/LinkedIn skills, X + Reddit signals, Postiz publishing, CMS/LinkedIn/Search Console providers) and the `content`, `blog` and `social` departments.
- `ContentMemory`, the content HITL approval manager (`src/approvals`), `/api/content/*`, `/api/approvals/*/resolve`, `/api/core/approvals`, the console Content screen and the content/blog/social 3D offices.
- `config/content-sources.yaml`, `knowledge/content/`, the organic `creative/sources/*` folders, `docs/content/linkedin-skills.md`, two organic campaign plans in `products/campaigns/`.
- Decode's organic mode (Instagram/TikTok); Decode is competitor ads + own ads only, and "Brief this" copies the brief instead of saving a content draft.
### Changed
- `skill_learnings`: `record_result` (content-post scoring) removed; `add`, `update_status`, `list`, `retro` unchanged. `skill_knowledge` now belongs to the research department (still shared).
- `knowledge/creative/SKILL.md` rewritten as an ad-creative-only skill; router rows for content removed.
- The approvals inbox lists ad changes only; the "First content approved" milestone was dropped from new clients' plans.
- `docs/content/namostri-awareness-draft.md` (a paid campaign) moved to `docs/ads/`.

## Unreleased: X + Reddit content flow
### Added
- `skill_social_signals` (research): X and Reddit posts as content ideas, for a topic or the queries in `config/content-sources.yaml`. Reddit via public RSS (no key); X via an Apify tweet-scraper actor (`APIFY_TOKEN`), which is against X's terms and replaceable by the official API.
- `skill_content_draft_set` (content): stores one topic as linked LinkedIn + Instagram carousel + Facebook (+ X thread) posts. Platform limits and banned phrases are enforced; one human approval covers the set.
- `skill_content_publish` (social): sends an approved set through Postiz (`POSTIZ_API_URL`, `POSTIZ_API_KEY`); `publish.mode` off / dry-run / live. Carousel slides are rendered to PNG (new dependency: `sharp`). Claims need a proofUrl; a failed send that may have gone out is marked UNCERTAIN and never retried.
- `knowledge/content/social-flow.md` and router rows.
### Changed
- One approval can now approve or reject several content pieces (`payload.contentIds`).

## Unreleased: cleanup (over-engineering audit)
### Removed
- The dashboard simulation (`/api/simulation/*`, scripted fake demo events) and the event types only it sent.
- Memory stores that nothing wrote to: experiment, strategy, performance, failure, knowledge graph (and `/api/knowledge-graph`). `skill_learnings` is the one place for results.
- Duplicate server routes: legacy `/api/content*` (use `/api/content/artifacts*`, now including `/:id/request-approval`), `/api/approvals` GET (use `/api/core/approvals`), static `/api/workflows`, empty `/api/metrics`.
- Unused Laya methods (`classifyIntent`, `evaluateHitlRisk`, `scoreAntiSlop`); `skill_ad_analysis` (use the `ads_analyze_creative` tool); `skill_social_generation` (use `skill_linkedin_post_writer`).
- Config keys nothing read: `automation.*` and `learning.*` in `business.yaml`; credential keys in `ads.yaml` (credentials come only from `ADS_DIRECT_*` env vars or the token store).
- Customer insights, unused TokenStore helpers, unused types, the `requiredMCPTools`/`category` skill fields.
### Changed
- `skill_campaign_analysis` now returns the same report as `skill_performance_reporting`.
- `run-daily`, `run-weekly` and `run-monthly` all run the due jobs (`runDueJobs`); they were already identical.
- One `BusinessConfig`/`AdsDirectConfig` type, inferred from its schema. Logger is a plain object. IDs use `crypto.randomUUID()`.

## 1.1.0 (2026-10-01)
### Added
- `skill_learnings` (available in every department, and on every MCP server): records results for published pieces, compares them with our own median for that format, and stores learnings with confidence levels (validated, emerging, hypothesis) that the code enforces. Old learnings are superseded, never deleted. A weekly `retro` lists stalled hypotheses and unmeasured pieces.
- `knowledge/content/`: `quality-gates.md` (topic gate, substance, one-core, density scoring, hooks, titles) and `test-ladder.md`.
- `knowledge/ops/`: `diagnose.md`, `review-panel.md`, `learning-loop.md`.
- `knowledge/SOURCES.md` (provenance and update record), `NOTICE.md`, this changelog.
- Spend guardrails in the DRAFT table in `ads/our-business-fit.md`.
- DeepSeek `discover` now returns a skill's description and input schema. Shared skills declare `inputSchema` for MCP clients.

### Removed
- Invented demo data that memory served as if it were real: a CTA experiment, two failures, a KPI snapshot and a Q1 strategy. They are also removed from existing `.marketing-data` snapshots when loaded.

## 1.0.0
- Department runtime, ads module, content module, MCP server, DeepSeek runner, `skill_knowledge` and the knowledge router.
