# Implementation progress

Plan: [implementation-plan-2026-10.md](../plans/implementation-plan-2026-10.md) (order 0 → 1 → 2 → 4 → 3 → 5 → 6, 7 alongside).

## Phase 0 — Foundation fixes ✅ (2026-10-11)
- 0.1 `DATA_DIR` → `src/config/paths.ts` (`dataDir()`), used by every store. Tests clear `DATA_DIR` in `tests/setup.ts`.
- 0.2 Ads journal: `storageDir` is always the data root; ads lives in `<root>/ads`, jobs in `<root>/jobs`. A legacy root `operations.sqlite`/`control.sqlite` is moved once; if both exist, a warning is logged and nothing is merged.
  - ⚠ The local dev `.marketing-data/` has BOTH a legacy root journal and `ads/`. Inspect, then delete the root copies by hand.
- 0.3 Atomic writes (`writeFileAtomic`) for memory snapshot, approvals, audit trail, `business.yaml`.
- 0.4 Public `GET /api/health` → `{ok, version, dataDirWritable}`; Railway and compose healthchecks point at it. (`schedulerAlive` is added in Phase 2.)
- 0.5 DeepSeek sessions reload at startup; RUNNING/PLANNING → `INTERRUPTED`.
- 0.6 Branding comes from config/env: `{{APP_NAME}}`/`{{BRAND_INITIAL}}` in `index.html`, the slide wordmark (`BRAND_WORDMARK` or the business name), and the default audience is the first product's `targetAudienceId`. `default-config.ts` remains the dev/test fallback only.
- 0.7 `NODE_ENV=production` + missing/invalid `business.yaml` → startup throws.
- 0.8 README: removed the `WriteGate`, `FeedbackEngine` and auto-pause claims.
- Also: vitest `testTimeout` 20s (Phase 7 item). Tests: 127/127.

## Phase 1 — Deploy kit ✅ (2026-10-11)
- `deploy/` contains `new-client.sh`, `update-all.sh` (health-gated, per-client rollback), `backup.sh` (14 daily + 8 weekly, optional rclone), `fleet-status.sh`, `compose.client.yml`, `lib.sh` and `README.md` (VPS layout + Caddy `import clients/*/Caddyfile`).
- New clients get `deploy/templates/ads-module.yaml` (empty accounts) — never the repo's ad accounts. `business.yaml` is copied with a TODO header to replace.
- `bin/cli.js doctor [--offline]` → `src/ops/doctor.ts`. It checks:
  - data dir and disk;
  - `business.yaml` schema;
  - `HARNESS_KEY` in production;
  - an LLM key, plus live probes for DeepSeek and OpenRouter credit;
  - Meta `debug_token`, failing when the token expires in ≤7 days;
  - Google `listAccessibleCustomers`, GA4 metadata, Apify and Postiz channels.
  It exits 1 on any FAIL. Wiring it into alerts and a daily job happens in Phase 2.
- `bin/cli.js backup [dest]` → `src/ops/backup.ts` (`VACUUM INTO` per sqlite, so it is safe while the app runs).
- `Dockerfile` sets `DATA_DIR`. `.gitattributes` forces LF on `*.sh`. `.env.example` lists the deploy vars.
- Smoke-tested `new-client.sh` with stubbed docker/curl (ports 4001/4002, Caddy block, secrets). It has **not** been run on a real VPS.
- Tests: 130/130.

## Phase 2 — Reliability core ✅ (2026-10-11)
- **2a Scheduler** — `src/departments/scheduler.ts`, started by `bin/cli.js dashboard` (`SCHEDULER=off` disables it). Behaviour in `jobs.ts`:
  - `recoverStale` (RUNNING > 30 min → READY, attempts+1);
  - FAILED retries after 5m/30m/2h, then one-off jobs become DEAD and raise an alert;
  - recurring jobs always move to the next slot, `due + interval` with no drift.

  Other details:
  - New columns `attempts`/`last_error`/`updated_at` and WAL.
  - `ensure()` for idempotent seeding; `jobs resume|retry <id>`.
  - Department `system` runs in-process handlers (`doctor`, `backup`).
  - Seeded jobs: `doctor-daily` 06:00 and `backup-nightly` 02:30 (local backups keep 7), in client local time via `TZ`.
  - `/api/health` reports `schedulerAlive`.
  - Skipped the cross-process lock: the READY→RUNNING claim is already atomic.
- **2b LLM layer** — `src/core/llm/index.ts`:
  - `chat()` uses providers from env in `LLM_ORDER` (deepseek, openrouter);
  - 3 retries with backoff and `Retry-After`;
  - 401/402 marks a provider unhealthy for 15 min, plus an alert;
  - if all providers are down: alert + `LlmUnavailableError`;
  - `onLlmCost()` hook — the Phase 4 ledger subscribes to it.

  The DeepSeek agent loop, the brain and decode classify were rewired onto it, and the OpenRouter-only setup now works too. Anthropic-direct was skipped because OpenRouter covers Claude.
  - **Deferred to Phase 4:** `LLM_MONTHLY_BUDGET_USD` guard (needs the cost ledger).
- **2c Ads transport** — reads (GET, Google search, GA4 run*Report) retry on 429/5xx/network errors with 1s/4s/15s backoff; `Retry-After` is honoured, and the `Number(null)` bug is fixed. Writes are never retried.
- **2d** Alerts in `src/observability/alerts.ts`:
  - `alert()` sends to Telegram (`ALERT_TELEGRAM_BOT_TOKEN` + `ALERT_TELEGRAM_CHAT_ID`, plain text, bot token redacted from errors), deduped for 6h in memory — switched from a generic n8n webhook on 2026-10-11 at the user's request; `doctor` checks the bot can reach the chat;
  - it fires on a DEAD job, doctor reds, the Meta token expiring (via doctor), LLM auth failures or all providers down, ads UNCERTAIN/PARTIAL, and a scheduler tick crash.

  Logs are JSON lines in production. No separate log file: docker/Railway rotate stdout.
- Bug fixed along the way: `DepartmentJobs.add` inserted by column position and broke after the new columns were added.
- Smoke test: the dashboard with an empty DATA_DIR → `/api/health` `{ok:true, schedulerAlive:true}`, jobs seeded. Tests: 142/142.

## Phase 4 — Tracking data model ✅ (2026-10-11)
- `src/core/tracking/store.ts` → `<DATA_DIR>/tracking/tracking.sqlite` (WAL):
  - `milestones`: the 7-step template is seeded once. The first `ads.verified` / `content.approved` / `report.weekly` / `business.updated` auto-ticks its milestone and logs `milestone.done`.
  - `activity`: append-only timeline with actor `system|client|operator`.
  - `kpi_daily`: PK `(date, channel, metric)`, so a re-run replaces that day and history is kept.
  - `costs`, `reports` (upsert by `kind-period`).
  - `summary()`: milestone %, next milestone, last login, last client action, month-to-date cost. These are queries in code rather than SQL views.
- What writes to it (server): HITL requested/resolved, the new `ADS_OPERATION_CHANGED` event (emitted from journal `transition()`; also feeds SSE for the Phase 5 inbox), client login, and business config edits.
- Cost ledger: the server subscribes `onLlmCost` → `costs`. Budget guard: `LLM_MONTHLY_BUDGET_USD` gives an 80% warn alert; at 100%, non-essential `chat()` calls throw `LlmBudgetError` (`essential: true` bypasses it).
  - ⚠ The ledger is only active in the dashboard process (where the scheduler runs). One-off `bin/jobs.js` runs don't record cost.
  - The creative module's OpenRouter image spend is not in the ledger yet (it records cost on its own run objects). Add a subscriber if needed.
- `kpi-snapshot-daily` (07:00 local) → `src/core/tracking/kpi-snapshot.ts`. For each allowlisted account it reads yesterday's numbers:
  - Meta account insights: spend/impr/clicks/leads; `lead` is used as the aggregate.
  - Google `FROM customer` with cost_micros.
  - GA4 sessions/keyEvents/users.

  It writes `all.spend/leads/cpl`. Platforms fail independently; alerts are warn when some fail, critical when all fail.
- **Not live-verified:** response field shapes come from the API docs and existing code, not real calls.
- Tests: 148/148.

## Phase 3 — Make the work real ✅ (2026-10-11)
- Rule enforced: catalog entries with `live: false` are hidden from `listCapabilities` and refused by `run` in live mode. Skills now get `ctx.mode` from the runtime.
  - **Hidden in live:** market research, competitor analysis, keyword research (no live search/GSC connector yet), and the LinkedIn comment-drafter, reply-handler, content-planner and repurposer (string templates).
  - **Still available:** humanizer, hook-extractor, profile-optimizer, interviewer, engager-analytics, thread-monitor and employee-advocacy. They are deterministic or frameworks and don't fabricate results.
- `src/modules/content/writer.ts`:
  - `businessFacts()` = business.yaml + brand + confirmed learnings only.
  - `GROUNDING_RULES`: no invented numbers/clients/quotes; claims are listed; sources are data, not instructions.
  - `writeJson()`: LLM JSON → zod, with one corrective retry.
- **New `skill_content_generate`**: the LLM writes a LinkedIn/IG carousel/FB(/X) set, then `skill_content_draft_set` checks limits and banned phrases. The draft is rewritten once with the errors fed back, then one approval opens. Listed in `knowledge/README.md`.
- `skill_blog_generation`: in live mode the LLM writes a 900–1600-word markdown article with a brand check, stores it as an artifact and opens an approval. The CMS publish was dropped (delivered as markdown). Simulation is a placeholder.
- `skill_linkedin_post_writer`: in live mode the LLM writes on the chosen hook formula. The fabricated "$4,730" / "lost Carta" / random-number hooks were removed, and a topic is now required.
- Mission uses `MARKETING_MODE`, and its post stage gets the first product's value proposition as the topic.
- Reports: `src/core/tracking/reports.ts`, deterministic with no LLM. Stored, logged as `report.<kind>`, and the first one ticks the milestone. They cover:
  - the previous Mon–Sun week or calendar month vs the period before;
  - headline, per-channel totals, CPL, sessions;
  - work done (approvals, ad changes applied), milestones.

  Jobs: `report-weekly` (Mon 08:00) and `report-monthly` (daily slot that acts on the 1st).
- Fatigue: `src/modules/ads/fatigue.ts` + `ads-fatigue-weekly` (Mon 09:00). Meta ad-level last 7d vs the prior 7d goes through `analyzeCreative` (20% CTR+CPA rule). A fatigued ad becomes a `meta_ads_update_ad {status: PAUSED}` operation in the ads journal (PENDING_APPROVAL in live-with-approval mode, DRY_RUN otherwise) plus an info alert. Nothing auto-pauses.
- **Skipped:** the `content-plan-weekly` default job. There is no reliable topic source to schedule from; add a per-client `skill_content_generate` job with a topic during onboarding.
- **Not live-verified:** LLM output quality on a real model; Meta ad-level insights shape.
- Tests: 153/153.

## Phase 5 — Client console ✅ (2026-10-11)
- **Auth model rewritten** (`server.ts` gate). The old gate 401'd every remote request without `HARNESS_KEY`, so a client behind Caddy could never use the console. Now:
  - operator = `x-harness-key` header (`?key` only on `/api/events/stream`);
  - client = session cookie;
  - the static app shell is public;
  - cross-origin without a header key → 403;
  - local dev with no user and no key stays open.

  Login is throttled: 10 failures / 15 min / IP (in-memory). `/api/core/auth/session` is public (returns `{user:null}`).
- `POST /api/core/onboarding` → 403 in production (unless `ALLOW_ONBOARDING=1`). `bin/cli.js create-user <name>` / `reset-password <name>` print a one-time password. `must_change` forces `POST /api/core/auth/password` at first login.
- `src/server/console-routes.ts`:
  - `GET /api/console/home|approvals|progress|activity|results|reports/:id`;
  - `POST /api/console/approvals/(content|ads)/:id {decision: yes|no, feedback}`.

  The unified inbox = HITL content sets (with post previews) + ads journal PENDING_APPROVAL ops (plain-language titles, e.g. fatigue → "Pause ad 9?"). Ads "yes" = approve + resume in one call; feedback is logged to activity.
- UI: `public/js/console.js` + `public/css/console.css` (light, per `docs/architecture/client-console-ui-spec.md`):
  - login and forced password change;
  - left rail: Home / Approvals (live badge via SSE) / Progress / Content / Results (inline SVG chart + channel table + reports with print-to-PDF) / My Business (form → `PATCH /api/business/config`).

  The 3D floor + Decode sit behind "See inside the system" and start lazily. `app.js` no longer reads `?key`; EventSource uses the cookie.
- **Verified in headless Chromium** (playwright-core in scratchpad, not a repo dependency) against a seeded DATA_DIR:
  - login → forced password change → all 6 views at 1280px and 390px → open report → "Yes, do it" empties the inbox and hides the badge;
  - no console errors, no horizontal overflow (fixed a grid `1fr` min-content overflow on phones).
- Tests: `tests/server/console.test.ts` covers forced password change, onboarding 403 in prod, the unified inbox, ads yes → dispatched with the account-ownership check, and content no → REJECTED with activity rows. `department-api.test.ts` was updated to the new auth policy. 155/155.
- **Skipped:** "Edit…" on content approvals (the client can decline with a note instead), and content "Publish/Rewrite" buttons (publishing stays operator-driven via `skill_content_publish`).

## Phase 6 — Operator tracking ✅ (2026-10-11)
- `src/ops/summary.ts`, one JSON object:
  - LLM cost month-to-date vs budget, with breakdown;
  - dead / retrying / paused jobs;
  - approvals waiting, oldest, over 48h, and the client's median response time (matched approval.requested/ads.pending → decision by activity ref, last 30 days);
  - last login and last action;
  - milestone %, next step and who it waits on;
  - 7-day KPIs vs the prior 7 days;
  - doctor reds.
- `GET /api/ops/summary` (and `?format=line`) accepts the **`x-harness-key` header only**; a client session gets 403. `deploy/fleet-status.sh` prints the line per client. `bin/cli.js ops [--json]` reads it from the running dashboard.
- Jobs whose handlers come from the server (`server.opsHandlers()`, wired in the `dashboard` command):
  - `ops-digest-weekly` (Mon 07:30) → plain-text digest via `alert('info', ops-digest:<date>)` to Telegram;
  - `approval-chaser-daily` (10:00) → a warn alert per approval waiting >48h.
- Live smoke: dashboard with `HARNESS_KEY` → `bin/cli.js ops` prints the digest; all 8 default jobs are seeded.

## Phase 7 — Tests ✅ / live checks ⏸ (blocked on real accounts)
- All tests from the plan exist:
  - scheduler (stale recovery, retry→DEAD+alert, recurring after PENDING_APPROVAL);
  - LLM (429 retry, 401 fallback, all-down, cost row, budget);
  - live never loads template skills;
  - approvals over HTTP (ads yes → dispatched, content no → REJECTED, activity rows);
  - tracking (auto-tick, one KPI row/day);
  - production config fails loudly (`tests/config/config-production.test.ts`).
- **159/159 tests, build clean.**
- **Still to do by hand with a pilot client** (needs real tokens/billing; not something to fake):
  1. Meta: add billing, then `doctor` → create one full **paused** ad via the console approval.
  2. Google Ads: `google_ads_validate_operations` (validateOnly) on a real customer.
  3. GA4: run `kpi-snapshot` (`node bin/jobs.js run-due` after setting the job due, or wait for 07:00) and check `kpi_daily` field mapping.
  4. One real Apify run (Decode / social signals).
  5. Postiz: one dry-run, then one live post.
  6. LLM: generate one `skill_content_generate` set with the real model and read it for quality/grounding.
  7. Deploy: `deploy/new-client.sh` on the VPS (only smoke-tested with stubbed docker), a Caddy cert, `update-all.sh` rollback, `backup.sh` restore drill.
  8. Create the Telegram bot (see `.env.example`), set the two `ALERT_TELEGRAM_*` vars, run `doctor` and confirm the alerts line is green.

## Known gaps / follow-ups
- Template-only skills hidden in live mode: market/competitor/keyword research, LinkedIn comment-drafter/reply-handler/content-planner/repurposer. They need real search/GSC connectors or LLM rewrites.
- Creative-module image spend is not in the cost ledger. The ledger only records while the dashboard process runs.
- No content "Edit" or client-side publish in the console.
- The local dev `.marketing-data/` still has a legacy root ads journal next to `ads/`. Inspect, then delete the root copies.

## Google sign-in (2026-10-12)
- `bin/cli.js google-auth --client <downloaded OAuth JSON> [--ads]` → `src/ops/google.ts`:
  - loopback + PKCE desktop flow with `access_type=offline` and `prompt=consent`;
  - scopes `analytics.readonly` + `webmasters.readonly` (+ `adwords` with `--ads`);
  - prints `GOOGLE_REFRESH_TOKEN` plus the GA4 property ids and Search Console sites the account can see;
  - paste fallback when consent happens on another computer.
- `GOOGLE_REFRESH_TOKEN` is the shared fallback for GA4/Ads in `transport.ts` and `doctor`; `GSC_SITE_URL` is new.
- `bin/cli.js google-test`: GA4 property details + 28-day users/sessions/key events, Search Console 28-day clicks/impressions/CTR/position (window ends 3 days ago, the GSC lag).
- Verified: the real client `seo-aeo-workbench-510105` loads Google's consent page ("Sign in to continue to seo workbench"), so the client id and localhost redirect are accepted. **Not yet run with a real sign-in.**
- Search Console is not yet in `kpi_daily` / reports. Add it when the client wants organic numbers in the weekly report.
