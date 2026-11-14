# Ads Automation Bridge — Integration Specification

**Status:** Draft for review · **Primary author:** DeepSeek Harness agent · **Date:** generated

**Target:** connect the marketing-harness to real Google Ads / Meta Ads / GA4 data so the
15 agents and the daily / weekly / monthly loops run against **live accounts** with
**read + write** (budget changes, campaign pause, negative-keyword push), gated by the
existing Level 0–3 HITL approval system.

---

## 1. Current State (verified against `src/`)

| Component | Reality today |
|---|---|
| `src/mcp/mcp-client.ts` | **In-process tool registry** with `MCPClient.callTool(name, args)`. Not an MCP client — no JSON-RPC, no transport, no OAuth. |
| `src/mcp/integrations/google-ads-mcp.ts` | **Mock.** Handlers return hardcoded numbers (`spend: 6850`, `roas: 8.75`). |
| `src/mcp/integrations/meta-ads-mcp.ts` | **Mock.** Hardcoded fatigue alerts + Andromeda score. |
| `src/mcp/integrations/ga4-mcp.ts` | **Mock.** Hardcoded funnel + attribution. |
| `src/mcp/integrations/search-console-mcp.ts`, `email`, `crm`, `cms`, `web-research`, `linkedin` | **Mock / staging-only.** Same pattern. |
| `src/workflows/daily-loop.ts` | Calls the mock tools by name and **currently auto-executes** `meta_ads_pause_fatigued_ad` and `google_ads_apply_negative_keywords` (write ops, no HITL check in-loop). |
| `src/approvals/hitl-manager.ts` | Legacy content approval store; provider writes use the durable `AdsService` operation journal. |
| `config/business.yaml` | **Real business**: Pratap AI Innovations; ₹1.5L/mo budget (₹60k Google, ₹45k Meta); CAC ₹35k → target ₹20k; target ROAS 5.5; geography IN/UK/US/SEA/Gulf. |

**Implication:** no code path today touches a real ad platform. The "MCP" layer is the
bridge point — its *facade* is stable and correct, but its *backing implementations* are
wholly simulated.

---

## 2. Objective & Non-Goals

### Objectives
1. Let the 15 agents + daily/weekly/monthly loops read **real** campaign, ad, keyword,
   and GA4 metrics.
2. Let write operations (pause fatigued ads, apply negative keywords, adjust budget/bids,
   create/pause campaigns) reach **real** platforms — always through the HITL gate.
3. Keep agent, skill, and loop source **unchanged** — they keep calling the existing
   `MCPClient.callTool('google_ads_*')` / `meta_ads_*` / `ga4_*` names.
4. Preserve an **offline/dev mode** so tests and demos keep working with mock data when
   credentials are absent.

### Non-goals (v1)
- Rebuilding the 15 agents or the memory layer.
- A GUI for ad management (the Web/3D dashboard is out of scope here).
- Replacing your CRM/CMS/email/SEO mock integrations (they can follow the same pattern later).

---

## 3. Strategic Decision: Provider vs Direct (this is the fork you asked me to explain)

### Option A — Ryze AI hosted MCP (the repo you linked)
- **Transport:** MCP **streamable HTTP** → `https://connector.get-ryze.ai/mcp`.
- **Auth:** OAuth 2.1 + PKCE; browser login with the Google/Facebook account that owns the
  ads. **No API keys.**
- **Tools:** 250+ real tools, e.g. `list_accounts`, `list_campaigns`, `create_search_campaign`,
  `keyword_planner`, `runRawGaql`, `update_budget_and_bids`, `meta_create_campaign`,
  `meta_create_ad`, `meta_get_insights`, `ga_run_report`, `ga_run_realtime_report`.
  Tool names mostly differ from your current mock names → a thin name-mapping shim is needed.
- **Build work here:** High. **A real MCP client must be written from scratch**:
  `@modelcontextprotocol/sdk/client`, the streamable-HTTP transport, and a **local OAuth
  PKCE loopback** (fire a temporary localhost redirect server to catch the auth code) so the
  browser login handshake completes. Then a registration adapter that pulls the live tool list
  and wraps each as an `MCPToolDefinition`.
- **Pros:** Fast (live this week), zero API-key management, vendor-maintained.
- **Cons:** **Every read and every mutation flows through a third-party server (Ryze AI).**
  Credentials are delegated via OAuth; budget changes and campaign edits pass through them.
  Free today but commercial posture; repo is also a fork (`irinabuht12-oss`). For a real
  business moving ₹60k/mo on Google alone, this is a **trust/control dependency**.

### Option B — Direct official SDKs (self-hosted)
- **Google Ads:** `google-ads-api` / REST, requires an API **dev token** + OAuth, then a
  Google **production-access approval** (takes days–weeks).
- **Meta:** a Meta app with `ads_management`, `ads_read`, `read_insights` tokens + long-lived
  system-user token; Meta occasionally re-audits apps.
- **GA4:** Google Analytics Data API via OAuth, or a GCP service account over BigQuery.
- **Build work here:** High — real HTTP clients for three APIs, token refresh, error mapping,
  plus the same facade wrapping. The mock handlers become the offline fallback.
- **Pros:** **Direct** calls, no third party between you and the platforms — the right trust
  posture for moving money hands-free.
- **Cons:** Slowest to stand up (Google prod approval + Meta app review), ongoing maintenance
  (API v20 schema churn, quota/refresh issues).

### Recommendation: **Hybrid — build the transport once, point at Ryze now, keep the door open**
1. Build a **generic MCP transport + OAuth loopback layer** once. This is needed regardless.
2. Register a **Ryze-backed adapter** first to get live data quickly.
3. Add a **credentialed direct adapter** behind the same facade later (Option B) and flip a
   `config` flag per server (`mode: auto | mock | ryze | direct`) — **zero agent-code changes**.
4. The OAuth loopback + token store you build for Ryze directly reapplies to Google/Meta
   official OAuth later.

---

## 4. Recommended Architecture (the Hybrid)

```
        agents / skills / daily-loop / weekly-loop / monthly-loop
                        │  callTool('google_ads_*' | 'meta_ads_*' | 'ga4_*')
                        ▼
                ┌───────────────────────┐
                │  MCPClient (facade)   │  — unchanged
                └──────────┬────────────┘
                           │  tool.name preserved for agent-facing callers
                           ▼
        ┌────────────────────────────────────────────┐
        │  Tool Adapter Registry (new router layer)  │
        │  name → fluent adapter, per config mode    │
        └────────────────────────────────────────────┘
             │ server='ryze'          │ server='mock' (offline)
             ▼                        ▼
   ┌───────────────────────┐   ┌─────────────────────┐
   │ RyzeMCPClient         │   │ existing mock       │
   │ (streamable HTTP +    │   │ handlers            │
   │  OAuth PKCE loopback) │   │ (kept, dev only)    │
   └───────────────────────┘   └─────────────────────┘
        │ OAuth token store → config/.env (local disk)
        ▼
   https://connector.get-ryze.ai/mcp   (Google + Meta + GA4)
```

### Write-operation safety (the part that protects your real money)
- Every **mutating** wrapped tool goes through a new `WriteGate`:
  1. Map the action to a `HITLManager` level and impact assessment
     (e.g. `meta_ads_pause_fatigued_ad` → Level 2; budget change > ₹5,000 / $5,000 → Level 2;
     campaign create over budget → Level 3).
  2. Create an approval request; **only on APPROVE** does the real call fire.
  3. Log to `AuditTrail` before + after, with the exact payload sent to Google/Meta.
- Currently `daily-loop.ts` calls write tools **without** the HITL gate — this spec **fixes
  that** so live writes are always human-authorized at the configured level.

### Config surface (`config/business.yaml` or new `config/ads.yaml`)
```yaml
ads:
  google_ads:
    mode: ryze            # auto | mock | ryze | direct
    writeLevel: 2
  meta_ads:
    mode: ryze
    writeLevel: 2
  ga4:
    mode: ryze
    writeLevel: 0          # reads only → no gate
  credentials:
    ryze_endpoint: https://connector.get-ryze.ai/mcp
    # direct-mode keys added later (google dev token, meta token, GA4 sa)
```

---

## 5. Implementation Plan (phased, each phase independently mergable)

### Phase 0 — Scaffold (no behavior change)
- Add `mcp/transport/` (transport interface + streamable-HTTP impl), `mcp/oauth/`
  (PKCE + loopback server + token store at `.marketing-data/oauth/`), `mcp/write-gate.ts`.
- Add deps to `package.json`: `@modelcontextprotocol/sdk`, `open`/`crypto` (browser loopback),
  a fetch-http client that works in the existing `type: module` setup.
- Add `config/ads.yaml` + schema check; keep `mode: mock` default so nothing regresses.

### Phase 1 — Ryze read path (live data, no writes)
- Implement `RyzeMCPClient` connecting, OAuth handshake via loopback, `tools/list` → register
  **all 250+** tools behind a name-mapping shim so your existing `google_ads_get_campaign_performance` /
  `meta_ads_get_performance_and_fatigue` / `ga4_get_funnel_metrics` calls resolve to real data.
- Keep mock handlers as fallback when `mode: mock` or unauthenticated.
- **Acceptance:** `bin/cli.js status` and `run-daily` show **real** numbers; a `mcp:list` debug
  command lists the live tool set.

### Phase 2 — Write path behind the HITL gate
- Wrap the mutating tools with `WriteGate` (mapping/lifecycle in §4). Thresholds read from
  `config/business.yaml` (`automation.approvalRules`, `budgetChangeThresholdUSD`).
- Update `daily-loop.ts` so fatigue-pause and negative-keyword calls **await HITL approval**
  before hitting Ryze (this is the key safety change).
- **Acceptance:** writes are staged → approved via HITL → executed → audit-logged; rejects
  abort cleanly with no platform mutation.

### Phase 3 — (Later, optional) Direct adapters
- Add `mode: direct` for Google (prod approval) and Meta (app+token), reusing the Phase-1
  transport/OAuth plumbing and the same facade. Flip the config per server to cut over.

---

## 6. Security & Risk Notes
- **Ryze mode trusts a third party for credentials and all mutations.** Keep `writeLevel`
  strict (≥2) until/unless you move to Direct mode.
- OAuth tokens stored **only on this machine** under `.marketing-data/oauth/` (git-ignored).
- No ad data is persisted beyond in-memory tool results + the audit trail; no secrets in `git`.
- A **dry-run** writer (`WriteGate.dryRun: true`) returns the exact payload that *would* be
  sent, for review, without firing.
- Guard: never allow a write when `mode: mock` (mocks must stay read/simulated).

---

## 7. Open Decisions Before Code
1. **Provider fork:** proceed on **Hybrid (Ryze first, swap later)** — the recommended default?
2. **Domain/account scope:** which Google Ads + Meta ad accounts belong to this harness
   (Pratap AI)? Needed to run the OAuth login and `list_accounts` first-call pattern.
3. **Write thresholds:** confirm HITL levels for each write type (pause ad / negative keyword /
   budget change / create campaign). Defaults: pause=2, neg keywords=2, budget=2, create=3.
4. **Test scope:** keep the existing vitest suite green in `mock` mode (no network in tests).
5. Do you want the funding/consent to create a **Ryze account** and run the OAuth during Phase 1?

---

*This spec can be reviewed, then implementation follows Phase 0 → 1 → 2, each green and
independently reviewable. No changes to agent/skill/loop callers are required.*
