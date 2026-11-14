# Marketing Harness → reliable one-client-per-deployment service, with client tracking

## Context
Audit result (2026-10-11): the ads core works and is safe. Real Meta, Google and GA4 calls go through a payload-bound approval journal, and all 115 tests pass. Everything around that core is still single-business, operator-driven or canned:
- No scheduler.
- Canned blog, LinkedIn and research skills.
- No client UI for approvals or progress.
- The Railway healthcheck returns 401.
- No LLM retries or cost tracking.
- Hardcoded "Pratap AI / Front Desk" data.
- The ads journal is split between the server and the CLI.

How it will be used:
- **One client per deployment**, set up personally for each client.
- **Only the client logs into the dashboard.** You track things through alerts and digests, not the dashboard.
- **Tracking** covers four things: engagement progress, results and KPIs, client activity, and your own costs and failures.
- **LLM:** whichever configured model is up and working gets used.
- **Deployment** must be easy and low-maintenance: it heals itself, and alerts you only when a person really has to act.

Goal: you can stand up a new client in under 30 minutes. The system then runs daily on its own, the client sees progress and approves work in a simple console, and you get pinged only when needed.

---

## Phase 0: Foundation fixes (prerequisite, ~1–2 days)
| # | Change | Where |
|---|---|---|
| 0.1 | One `DATA_DIR` env var (default `.marketing-data`) as the single storage root. Every store takes it instead of `process.cwd()`. | `memory-manager.ts:25`, `hitl-manager.ts:19`, `audit-trail.ts:27`, `deepseek-brain.ts:57`, `token-store.ts:30`, `jobs.ts:20`, `daily-loop.ts:4`, `server.ts:57-59`, `bin/*.js` |
| 0.2 | Fix the ads journal split: the server and CLI both use `${DATA_DIR}/ads`. One-time migration copies `.marketing-data/operations.sqlite` and `control.sqlite` into `ads/` if those are newer. | `server.ts:57`, `modules/ads/service.ts:51` |
| 0.3 | Atomic writes (tmp file + rename) for `memory-snapshot.json`, `approvals.json` and `decision-audit-trail.json`. Reuse the pattern already in `deepseek-brain.ts:56`. | `memory-manager.ts:83`, `hitl-manager.ts:31`, `audit-trail.ts` |
| 0.4 | Public `GET /api/health` (no auth; returns `{ok, version, dataDirWritable, schedulerAlive}`). Point `railway.json` and the compose healthcheck at it. | `server.ts:137-179`, `railway.json`, `docker-compose.yml` |
| 0.5 | Reload sessions from disk at startup, and mark any `RUNNING` session as `INTERRUPTED`. | `deepseek-brain.ts:22` |
| 0.6 | Remove hardcoded client data. Everything comes from `config/business.yaml`, plus `APP_NAME` / `BRAND_INITIAL` for the UI. Affected spots: the default personas, `aud_b2b_operator` (becomes the first persona from config), "Front Desk" trigger defaults, the slide wordmark, `cms-mcp` author, and `public/index.html` title/logo. | `default-config.ts:5-13`, `customer-memory.ts:22-68`, `modules/content/index.ts:17`, `draft-set.skill.ts:76`, linkedin skills, `server.ts:365,368`, `slides.ts:27`, `index.html` |
| 0.7 | In production, invalid or missing `business.yaml` **fails startup loudly** instead of silently using defaults. The fallback stays only for tests. | `config-loader.ts:95-101` |
| 0.8 | Make the README truthful: remove `WriteGate`, `FeedbackEngine` and "auto-pauses fatigued ads" until they exist. | `README.md` |

---

## Phase 1: Deployment kit: "one client = one folder" (~2 days)
Goal: setting up a client, updating them and backing them up are each one command.

**Layout on the VPS**
```
/srv/harness/
  image: built once, tagged (ghcr or local)   ← same image for every client
  clients/<slug>/
    .env                 ← that client's keys only
    config/business.yaml, ads-module.yaml, content-sources.yaml
    data/                ← mounted as DATA_DIR (volume)
    backups/
  Caddyfile              ← <slug>.yourdomain.com → container:port, auto-HTTPS
```

**Scripts** (bash; new `deploy/` folder):
- `deploy/new-client.sh <slug> <domain>`
  1. Copies the templates.
  2. Generates random `HARNESS_KEY` and `MARKETING_TOKEN_KEY` values.
  3. Picks a free port, writes `compose.yml`, and adds a Caddy block.
  4. Starts the client, then runs `doctor`.
- `deploy/update-all.sh` pulls the new image, then restarts clients one at a time. Each restart is health-gated and rolls back to the previous tag if `/api/health` fails.
- `deploy/backup.sh` (cron, nightly):
  - Runs `sqlite3 .backup` for each `*.sqlite`, plus a tar of the JSON files.
  - Keeps 14 daily and 8 weekly copies, with an optional rclone to Google Drive.
  - Backups are also exposed as a scheduler job, so a failed backup raises an alert.
- `deploy/fleet-status.sh` calls each client's `/api/ops/summary` (header key) and prints one table row per client.

**`bin/cli.js doctor`** (new command, also run at boot and daily) checks:
- Required env vars are present for the enabled modules (from `ads-module.yaml`, `content-sources.yaml`).
- Token validity, with a cheap read call per provider: Meta `/me`, Google Ads `listAccessibleCustomers`, GA4 metadata, Postiz, Apify, and each LLM provider.
- **Token expiry:** the Meta long-lived token expires after 60 days, so warn 7 days ahead. Google uses refresh tokens.
- `DATA_DIR` is writable and there is enough disk space.

It prints a green/red checklist, and any red result becomes an alert.

**Compose** (from the existing `docker-compose.yml`): `restart: unless-stopped`, healthcheck on `/api/health`, a memory limit, log rotation (`max-size: 10m`), and `env_file: .env`.

**Railway** remains supported with the same image. The only requirements are the `/api/health` fix and a volume at `DATA_DIR`.

---

## Phase 2: Reliability core (~3–4 days)

### 2a. Built-in scheduler (`src/departments/scheduler.ts`, new, ~100 lines)
- **Timer:** a `setInterval(60s)` inside the dashboard process, started from the `dashboard` CLI command. It calls the existing `DepartmentJobs.runDue()` (`jobs.ts:34-55`).
- **Single runner:** a lock row (`scheduler_lock` with a heartbeat) so two processes never run jobs at once.
- **Crash recovery:** at boot, and on every tick, any job that has been `RUNNING` for longer than `stale_after` (default 30 min) goes back to `READY` with `attempts+1`. This is safe because write tools already use the idempotent `operationId = job-${id}-${due}` (`jobs.ts:46`).
- **Retries:** `FAILED` jobs are retried with backoff (5m, 30m, 2h; max 3 attempts). After that the job becomes `DEAD` and raises an alert.
- **Recurring jobs never stop.** Today a non-COMPLETED result kills the series (`jobs.ts:50`). After this change, `PENDING_APPROVAL` and `FAILED` still schedule the next run. Next run = `due + interval`, so the schedule doesn't drift.
- **Schema:** add columns `attempts`, `last_error`, `updated_at`, and turn on WAL.
- **CLI:** add `jobs resume <id>` and `jobs retry <id>`; `add` becomes an upsert.
- **Default jobs** are seeded at client onboarding (idempotent ids):
  - `kpi-snapshot-daily` at 07:00 client time
  - `ads-monitor-daily` (existing `ads_schedule_monitoring`)
  - `content-plan-weekly`
  - `report-weekly` (Monday)
  - `report-monthly` (on the 1st)
  - `doctor-daily`
  - `backup-nightly`
  - `ops-digest-weekly`

### 2b. LLM layer: "whatever is connected and working" (`src/core/llm/`, new)
- One function: `chat({messages, tools?, json?, purpose})` → `{message, usage, costUsd, provider, model}`.
- **Provider chain** is built from the keys that are present: `DEEPSEEK_API_KEY` → DeepSeek; `OPENROUTER_API_KEY` → OpenRouter (covers Claude, GPT and others); optionally `ANTHROPIC_API_KEY`. The order comes from `LLM_ORDER` (default: the order the keys are found). Each provider has a model env var (`DEEPSEEK_MODEL`, `OPENROUTER_TEXT_MODEL`).
- **Retry and fallback:**
  - Reuse the retry logic from `src/modules/creative/openrouter.ts:33-64`: 3 retries, backoff with jitter, and respect for `Retry-After`.
  - 401/402 (bad key or no credit) mark that provider **unhealthy for 15 min** and move to the next one.
  - If all providers fail, raise an alert and return a clean error. The calling job is retried by the scheduler.
- Rewire the existing callers onto it: `tool-runner.ts:33-40` (DeepSeek loop) and `decode/index.ts:~190` (classify). Both currently throw on the first error.
- Every call writes a row to the **cost ledger** (Phase 4). Token prices come from env, with the defaults from `decode/index.ts:176-180`; OpenRouter uses `usage.cost`.
- **Budget guard:** `LLM_MONTHLY_BUDGET_USD` per client. Warn at 80%. At 100%, pause non-essential jobs (approvals and reads keep working).

### 2c. Ads transport retry (`src/modules/ads/transport.ts:35-60`)
- Retry reads (GET and report queries) on 429, 5xx and network errors with real backoff: 1s, 4s, 15s. Remove the 1s cap and treat a missing `Retry-After` as "use backoff", which fixes the `Number(null)` bug.
- **Never auto-retry writes.** The journal's UNCERTAIN path already handles them correctly.

### 2d. Logging and alerts
- `logger.ts` writes JSON lines to stdout (docker captures and rotates them) plus `DATA_DIR/logs/app.log` (daily rotation, 14 days).
- **Alerts** (`src/observability/alerts.ts`, new): `alert(level, key, message)` sends straight to **Telegram** via a bot (`ALERT_TELEGRAM_BOT_TOKEN` + `ALERT_TELEGRAM_CHAT_ID`); no middle server. Includes dedup: the same `key` alerts at most once every 6h.
- Alerts are raised for: a job reaching DEAD, a doctor red, a token expiring soon, all LLM providers down, the budget at 80% or 100%, a backup failure, an ads operation going `UNCERTAIN`, and an approval waiting more than 48h (a client chaser).

---

## Phase 3: Make the work real (~4–5 days)
Rule: **live mode never loads a mock.** Anything without a live implementation is removed from the live catalog, so the agent can't call it.

| Skill | Today | Change |
|---|---|---|
| `skill_blog_generation` | fixed template, fake score 94, fake CMS URL | LLM draft → brand and claims check → store as a content artifact → approval. Drop the CMS publish until a real CMS is connected; deliver as markdown or Google Doc export. |
| `skill_linkedin_post_writer` | template with invented "$4,730" / "lost Carta" | LLM generation with a strict no-invented-facts prompt. Every number must come from `business.yaml` proof points or `skill_learnings`. Output goes through the existing `draft-set.skill.ts` validation (limits, banned phrases, claim→proof URL). |
| linkedin comment-drafter, repurposer, content-planner, reply-handler, etc. | string templates | Same LLM + draft-set path. Keep humanizer and hook-extractor (deterministic and fine). |
| `skill_market_research`, `competitor_analysis`, `keyword_research` | mock research / GSC | Live: web search via Apify (reuse `signals.ts:73-82` fetch pattern) plus LLM summary **with source URLs required**. GSC through the Google OAuth already present (needs the `webmasters.readonly` scope). Until then, hide them in live mode (`providers.ts:22`). |
| `increase-qualified-leads` mission | forced `simulation` | Use `MARKETING_MODE`. Run in live mode and stop at approvals (the e2e test already asserts this behaviour in simulation). |
| Ad fatigue | `adFatigueAlerts: []` | Use the existing logic in `modules/ads/measurement.ts:23-32` against `kpi_daily` history (Phase 4). Output is a **recommendation + approval** to pause, never an auto-pause. |
| Reports | `generate-report` prints to the console and isn't stored | Weekly and monthly reports are built from `kpi_daily` and `activity`, stored as a report row, shown in the console, and exportable as PDF (print CSS). |

---

## Phase 4: Tracking data model (~2 days)
New `src/core/tracking/` with one `tracking.sqlite` in `DATA_DIR` (`node:sqlite`, WAL, same style as `core-store.ts`).

| Table | Purpose | Written by |
|---|---|---|
| `milestones` (id, title, phase, owner `client\|system`, status, due, done_at) | **Engagement progress.** Seeded from a template at onboarding: Kickoff → Access connected → Brand approved → First content approved → First campaign live → First weekly report → Month-1 review. | onboarding plus auto-ticks from events (e.g. the first VERIFIED ads op ticks "First campaign live") |
| `activity` (ts, actor `system\|client`, type, summary, ref) | Append-only timeline: **what the system did** and **what the client did** (login, approve, reject, edit, feedback, config change). | an event-bus subscriber covering `HITL_REQUIRED/RESOLVED`, ads journal transitions, job results, publishes, and auth events from `core-store.ts` |
| `kpi_daily` (date, channel, metric, value) | **Results history:** spend, impressions, clicks, leads, CPL, ROAS, sessions and conversions (GA4), posts published, engagement. | the `kpi-snapshot-daily` job (fixes "no history kept": `service.ts:267` overwrites today) |
| `costs` (ts, kind `llm\|apify\|transcribe\|image`, provider, model, units, usd, job_id) | **Your cost per client.** | LLM layer, decode, creative (they already compute `costUsd`) |
| `reports` (id, period, kind, created_at, json) | Stored weekly and monthly reports. | report jobs |

Derived metrics, computed in SQL views rather than separate code:
- Client approval response time (median hours from `HITL_REQUIRED` to resolved).
- Last login.
- Approvals waiting.
- Milestone % complete.
- Month-to-date cost.
- Job failure count over 7 days.

---

## Phase 5: Client console: the only dashboard (~5–6 days)
Follows the existing spec, `docs/architecture/client-console-ui-spec.md` ("Front Desk Command": light theme, left rail, plain-language terms). Built in vanilla JS views like the existing `public/js/views/*.js`, with no new framework.

**Access model**
- Public self-onboarding (`POST /api/core/onboarding`) is **disabled in production**.
- You create the client's login during setup with `bin/cli.js create-user <username>`. It prints a one-time password, and the client must change it at first login.
- The login screen uses the existing `CoreStore` sessions (`core-store.ts`).
- A password-reset command is available from the CLI.

**Screens**
1. **Home:** a status strip (all good / needs you), 4 KPI cards (this week vs last), a "what we did while you were away" timeline (`activity`), a "Review N things" button, and the next milestone.
2. **Approvals (unified inbox):**
   - Shows pending HITL content sets (`/api/core/approvals`) together with ads operations in `PENDING_APPROVAL`.
   - **"Yes, do it" for ads calls `decide` and then `resume` in one server handler.** The routes exist at `server.ts:601-604`; today they need two calls.
   - "Not now" takes an optional reason, and "Edit" applies to content.
   - New SSE event for ads journal transitions, so the inbox updates live.
3. **Progress:** the milestone checklist with % complete, what's waiting on the client vs on the system, and the dates.
4. **Content:** a draft grid with status and brand-check badges, and a publish-status view (Postiz).
5. **Results:** a leads-vs-spend chart from `kpi_daily`, a per-channel table, the stored weekly and monthly reports, and a PDF export.
6. **My Business:** forms bound to `business.yaml` through the existing `GET/PATCH /api/business/config` (`server.ts:430-507`). Edits are logged in `activity`.

**Other UI changes**
- The 3D floor and Decode move under a hidden "See inside" view.
- `app.js` stops passing `?key` and uses the session cookie (SSE then authenticates via cookie, `server.ts:512-528`).

---

## Phase 6: Your tracking without a dashboard (~1–2 days)
Clients have the console; you get push and pull.
- **Push:** the alerts from 2d, plus a **weekly ops digest per client** (sent straight to Telegram) containing:
  - Cost month-to-date vs budget.
  - Job failures and retries.
  - Approvals waiting, and client response time.
  - Last client login.
  - Milestone progress.
  - KPI deltas.
  - Any doctor reds.
- **Pull:** `GET /api/ops/summary` (header `x-harness-key` only, never a client session) returns the same JSON. `deploy/fleet-status.sh` aggregates it across all clients into one table, and `bin/cli.js status` shows it locally.

---

## Phase 7: Live verification and tests (~2–3 days, parallel to 5–6)
**Live checks** (one pilot client):
- Add billing on Meta, then create a full paused ad.
- Run a Google Ads `validateOnly` call against a real customer.
- Pull a GA4 report.
- Do one real Apify run.
- Post one Postiz dry-run, then one live post.

**New tests** (vitest, same style as `tests/ads/ads-operation-lifecycle.test.ts`):
- Scheduler: stale-RUNNING recovery, FAILED→retry→DEAD plus alert, recurring jobs continuing after PENDING_APPROVAL.
- LLM layer: 429→retry, 401→fallback to the next provider, all down→clean error, cost row written (mock `fetch`).
- Live mode never loads a mock provider (catalog assertion).
- Approvals over HTTP: ads approve → dispatched in a single call; content approve → artifact status updated; `activity` rows written.
- Tracking: milestone auto-tick from events; kpi snapshot keeps one row per day.
- Config: invalid `business.yaml` fails startup in production mode.
- Raise `testTimeout` in `vitest.config.ts` to 20s (the sharp/ads tests time out at 5s on slower machines).

---

## Order and effort (≈ 4–5 weeks solo)
`0 → 1 → 2 → 4 → 3 → 5 → 6`, with 7 running alongside 5–6.
- Phases 0–2 make it **reliable and deployable**.
- Phases 3–4 make the work **real and measurable**.
- Phase 5 is what the **client sees**.
- Phase 6 is what **you** see.

Ship to the first real client after Phase 4, using CLI approvals plus the weekly report. Phase 5 then goes to that client.

## Deliberately skipped
- Multi-tenant code (one deploy per client covers it).
- A client-facing role system (a single client user).
- A new frontend framework.
- Auto-pausing ads (recommend + approve only).
- Email/WhatsApp alert channels (Telegram bot only; add another sender in `alerts.ts` if needed).

## Verification (end-to-end)
1. `pnpm build && pnpm test`: everything green.
2. `deploy/new-client.sh demo demo.localhost` → container healthy → `doctor` all green (or the expected reds for missing keys).
3. Log in as the created client user → onboarding milestones appear → change `business.yaml` in My Business → an `activity` row appears.
4. Trigger `kpi-snapshot-daily` → `kpi_daily` rows → Results chart renders.
5. Generate a LinkedIn draft set with real LLM output → it appears in Approvals → approve → Postiz dry-run → timeline updated → `costs` row written.
6. Create a paused Meta campaign draft → approve in the console → VERIFIED → the "First campaign live" milestone ticks.
7. Kill the container mid-job → restart → the job recovers from RUNNING and completes once (no duplicate ops in the journal).
8. Revoke the DeepSeek key → the next call falls back to OpenRouter, and an alert arrives in Telegram.
9. `deploy/fleet-status.sh` shows the demo client row; the weekly ops digest arrives.
