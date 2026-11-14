# Marketing harness: updates, 18 Sep – 2 Oct 2026

This is a summary of everything that changed in the marketing harness over the last 14 days, with links to the detailed docs.

**Where the dates come from.** The harness folder is not tracked by git: the repository root is the whole `D:/` drive and these files were never added. There is no commit history, so the dates below come from file modification times, `CHANGELOG.md`, and the dated docs in `docs/`. Most of the codebase was written to disk on 18 Sep, which looks like the initial import; everything below is what changed after that.

## At a glance

| Date | Area | What changed | Status |
|---|---|---|---|
| 19 Sep | Deployment | Docker Compose, Railway and `.dockerignore`; Three.js vendored for the 3D floor; Instagram TOFU "Front Desk" campaign brief | Files in place |
| 20 Sep | Product spec | Client console UI spec ("Front Desk Command"); web-research MCP integration | Spec only |
| 21–22 Sep | Ads research | Direct API reference for Google Ads (v25), Meta and GA4 | Research doc |
| 23 Sep | Architecture | Modular departments runtime; CLI (`ask`, `department`, `jobs`); scheduled jobs; OAuth loopback; MCP smoke test | Implemented, tested |
| 24 Sep | Meta live | First reviewed writes to Meta: Namostri awareness campaign, ad set and 2 creatives created **paused**; ad creation blocked by missing billing | Partly live |
| 24 Sep | Audit | Architecture audit: build passed, 51 / 51 tests | Snapshot |
| 28 Sep | Client app | Core store (admin onboarding, login, sessions); module registry; live 3D floor plus client dashboard; LinkedIn skill pack | Implemented, tested |
| 29 Sep | Ads safety | Ads module policy file, operation journal, state and transport; sequential Meta → Google → GA4 PRD; DeepSeek ads command flow | Implemented, tested (87 / 87) |
| 30 Sep | Structure | Ads and content code split into `src/modules/{ads,content}`; boundary test; ads and creative knowledge library | Done |
| 1 Oct | v1.1.0 | `skill_learnings`, knowledge router, quality gates; invented demo data removed | Released (1.1.0) |
| 1 Oct | Cleanup | Over-engineering audit: about 1.5k lines removed (simulation, dead memory stores, duplicate routes) | Done |
| 1 Oct | Content flow | X + Reddit signals → multi-platform draft sets → Postiz publishing | Unreleased |
| 1–2 Oct | Decode | Live format-research tab for organic posts, competitor ads and our own Meta ads, with speech transcripts | Unreleased; see [decode.md](../guides/decode.md) |

Test suite over the period: 51 (24 Sep audit), then 65 and 87 (ads PRD work), then **96 passing** today.

---

## 1. Deployment and project setup (19–21 Sep)

- `docker-compose.yml`, `railway.json` and `.dockerignore` were added for container and Railway deploys. `Dockerfile` was last updated on 30 Sep.
- Three.js and OrbitControls are vendored in `public/js/vendor/`, so the 3D office floor works without a CDN.
- `tsconfig.json` was updated (21 Sep) and `vitest.config.ts` (29 Sep). `tests/setup.ts` runs every test in a temp working directory.
- Campaign brief: `products/campaigns/instagram-tofu-front-desk.md`, an awareness carousel for clinic, salon and spa owners themed "every unanswered message is an appointment booked somewhere else".

## 2. Client console spec (20 Sep)

[client-console-ui-spec.md](../architecture/client-console-ui-spec.md) defines the client-facing product, **Front Desk Command**. It is written for non-technical owners: plain-English copy, no engine branding, a light theme, and a WhatsApp-green accent. It is the design brief behind the client dashboard built on 28 Sep.

## 3. Direct ads integration (22–29 Sep)

- **Research.** [ads-api-integration-reference.md](../ads/ads-api-integration-reference.md) is verified against official docs. Google Ads must be pinned to REST `v25`.
- **Integration.** [ads-direct-integration.md](../ads/ads-direct-integration.md) covers first-party API calls to Google Ads, Meta and GA4 with no third-party proxy:
  - Credentials come only from `ADS_DIRECT_*` environment variables or the OAuth token store.
  - OAuth uses a localhost PKCE loopback (`src/mcp/auth/oauth-loopback.ts`).
- **Safety model.** Defined in [ads-automation-prd.md](../ads/ads-automation-prd.md) and `config/ads-module.yaml`:
  - The module defaults to `dry-run`.
  - Account allowlist: Meta `2245143739365491`.
  - Every provider write needs exact-payload human approval and is recorded in a durable operation journal (`src/modules/ads/journal.ts`).
  - Campaigns are always created **paused**; activation is a separate approval.
  - Partial launches resume without recreating parents. Uncertain ones stay blocked.
  - Rollout order: Meta first, then Google Ads, then GA4.
- **DeepSeek as operator.** [deepseek-ads-command.md](../ads/deepseek-ads-command.md) and [deepseek-operating-notes.md](../ads/deepseek-operating-notes.md): an operator asks in plain language; DeepSeek discovers the exact capability, reuses stored defaults, and asks only for blocking or high-risk inputs.

## 4. Modular departments (23 Sep)

[departments-quickstart.md](../guides/departments-quickstart.md) and [modular-departments-plan.md](../architecture/modular-departments-plan.md):

- **Eight departments** (`ads`, `analytics`, `research`, `content`, `blog`, `email`, `social`, `hq`), each usable on its own and loaded only when a task needs it.
- **149 ads and analytics operations**: 69 Meta, 44 Google Ads, 36 GA4. Every one is marked `implemented-not-live-verified` until authenticated acceptance testing.
- **Entry points:**
  - CLIs: `bin/ask.js`, `bin/department.js`, `bin/jobs.js`.
  - A scheduled-jobs runner: `src/departments/jobs.ts`.
  - Example inputs in `examples/`.
  - An MCP stdio smoke test: `tests/mcp/mcp-smoke.mjs`.

## 5. First live Meta work: Namostri awareness (24 Sep)

[namostri-awareness-draft.md](../campaigns/namostri-awareness-draft.md):

- **Created on Meta, all paused and provider-verified:**
  - Campaign `52549027430764`, objective `OUTCOME_AWARENESS`.
  - Ad set `52549028005564`.
  - Creatives Tyohaar and Roshni.
- **Blocked:** creating the ad itself failed with subcode `1359188`, meaning the ad account has no payment method. **No ads exist and no spend is possible until billing is added** in the ad account's billing centre. Use a new operation id when retrying.
- The 2 Oct own-ads Decode read confirms this: the account `act_2245143739365491` ("jai", INR) returns 0 ads.

## 6. Client app: core, live floor and dashboard (28 Sep)

- **Core store** (`src/core/client/core-store.ts`): one-time admin onboarding, login (scrypt), sessions and logout. All `/api/` routes require auth once an admin exists. `HARNESS_KEY` and `MARKETING_API_TOKEN` still work for scripts.
- **Module registry** (`src/core/modules/registry.ts`): the server runs the ads and content modules through one contract.
- **Dashboard:**
  - **Live floor:** a 3D office where each department's desk mirrors real task status over SSE.
  - **Client dashboard:** CAC, qualified leads, ROAS, tracked spend, active work, items needing input, and recent outcomes.
- **LinkedIn skill pack** (removed; see the [ads-only changelog](../../CHANGELOG.md)): 11 skills ported from `sergebulaev/linkedin-skills` (MIT). They stage drafts only; nothing is published to LinkedIn.
- [modular-plan.md](../architecture/modular-plan.md) laid out the Core / Ads / Content split that was carried out on 30 Sep.

## 7. Ads and content module split (30 Sep)

- Code moved into `src/modules/ads/` and `src/modules/content/`, each with its own `providers/` and `skills/`. Tests, docs and examples were split the same way.
- `tests/core/module-boundaries.test.ts` fails if either module imports the other.
- `memory/content-memory.ts` stays in `memory/`, because the shared `MemoryManager` needs it.

## 8. Knowledge library (30 Sep – 1 Oct)

`knowledge/` holds all the guidance the tools read:

- **`README.md`:** the router (task → which files → which tool, plus which rule wins on conflict).
- **`ads/`:** B2B paid playbook, Meta and Google audit checklists, Meta campaign structures, analyse / optimise / scale, creative and copy, competitor intel, PPC math, report template, and `our-business-fit.md`.
- **`creative/`:** format library, layout ledger, and source material on ad copy, image prompting, carousels and content marketing.
- **`content/`:** quality gates, test ladder, and the social flow.
- **`ops/`:** diagnose, review panel, learning loop.
- **`SOURCES.md`:** where each guidance file came from and when it was updated. `NOTICE.md` holds third-party notices.

`skill_knowledge` is available in every department. Ads and creative tasks are told to read the router before acting.

**Still a draft:** the conflict table and `our-business-fit.md`. The research behind them is e-commerce, while Pratap AI is B2B lead generation. Hard spend rules in the write gate wait on confirmed CPL targets and budgets.

## 9. Version 1.1.0 (1 Oct)

From `CHANGELOG.md`:

- **`skill_learnings`:**
  - Records results for published pieces and compares each against our own median for that format.
  - Stores learnings with confidence levels (validated, emerging, hypothesis) that the code enforces. Old learnings are superseded, never deleted.
  - A weekly `retro` lists stalled hypotheses and unmeasured pieces.
- **DeepSeek `discover`** now returns a skill's description and input schema, and shared skills declare `inputSchema` for MCP clients.
- **Removed:** invented demo data that memory had served as if it were real (a CTA experiment, two failures, a KPI snapshot, a Q1 strategy). It is also stripped from existing `.marketing-data` snapshots on load.

## 10. Over-engineering cleanup (1 Oct)

Unreleased, from `CHANGELOG.md`. About 1.5k lines were removed.

- **Deleted:**
  - The dashboard simulation (`/api/simulation/*`) and its fake demo events.
  - Memory stores nothing wrote to: experiment, strategy, performance, failure, knowledge graph.
  - Duplicate routes: legacy `/api/content*` → use `/api/content/artifacts*`; `/api/approvals` → use `/api/core/approvals`.
  - Unused Laya methods, `skill_ad_analysis` (use `ads_analyze_creative`), `skill_social_generation` (use `skill_linkedin_post_writer`).
  - Config keys nothing read.
- **Simplified:**
  - `run-daily`, `run-weekly` and `run-monthly` all run the due jobs; they were already identical.
  - One schema-inferred config type.
  - The logger is a plain object, and IDs use `crypto.randomUUID()`.

## 11. X + Reddit content flow (1 Oct)

Unreleased; the flow is described in `knowledge/content/social-flow.md`.

1. **`skill_social_signals`:** real X and Reddit posts as content ideas, either for a topic or for the queries in `config/content-sources.yaml`.
   - Reddit is read through public RSS, with no key.
   - X is read through an Apify scraper (`APIFY_TOKEN`). This is against X's terms and can be swapped for the official API.
2. **`skill_content_draft_set`:** one topic becomes linked LinkedIn, Instagram carousel, Facebook and optional X thread posts. Platform limits and banned phrases are enforced, and one approval covers the whole set.
3. **`skill_content_publish`:** sends an approved set through Postiz.
   - `publish.mode` is currently **off**; the other values are dry-run and live.
   - Carousel slides are rendered to PNG (new dependency: `sharp`).
   - Claims need a proof URL.
   - A send that may have gone out is marked uncertain and never retried.

## 12. Decode tab (1–2 Oct)

Full detail is in [decode.md](../guides/decode.md). In short:

- **What it is:** a dashboard tab, modelled on the "Decode the Invo deal" reel, that collects posts or ads, sorts each into a format or angle with DeepSeek, and plots them live.
  - The live screen: animated counters, thumbnails flying onto a log-scale chart, a highlighted item, a detail panel, a ranked "which formats win" list, and "Brief this" to save a content brief.
- **Sources:** Instagram and TikTok posts, competitor ads from the Meta Ad Library, and **our own Meta ads**. Own ads are plotted by spend against ROAS, leads or CTR, read through the ads module so the allowlist applies.
- **Speech-to-text:** what's said in videos is transcribed by Groq, OpenAI, or local faster-whisper (free, already installed). Beats show `m:ss` timestamps.
- **Verified:**
  - Local transcription on a real reel.
  - A live own-ads read (0 ads, as expected from section 5).
  - The UI in a headless browser.
  - 96 / 96 tests.
- **Not yet run:** Instagram, TikTok and Ad Library scraping. `APIFY_TOKEN` is not set and the Apify actor inputs are unverified.

---

## Open items

| Item | Blocks | Owner action |
|---|---|---|
| Meta ad account has no payment method | Any Meta ad, delivery or spend; own-ads Decode stays empty | Add billing in Meta Business; retry ad creation with a new operation id |
| `APIFY_TOKEN` not in `.env` | X signals, Instagram / TikTok / Ad Library Decode | Add the token; verify the Decode actor inputs on the first run |
| Postiz publishing is `off` | Automatic posting of approved content | Set `POSTIZ_API_URL` / `POSTIZ_API_KEY`, then use `dry-run` before `live` |
| CPL targets and budgets unconfirmed | Hard spend rules in the ads write gate; the "our business fit" guidance | Confirm targets |
| Google Ads and GA4 accounts not allowlisted or verified | Google and GA4 phases of the rollout | Add accounts to `config/ads-module.yaml` after Meta is verified |
| Authenticated acceptance tests | Calling any provider operation "live-verified" | Run per account, objective and format (see [departments-quickstart.md](../guides/departments-quickstart.md)) |
| Nothing is committed | History, rollback, review | Add the harness folder to version control (ideally its own repo, not the `D:/` root) |
