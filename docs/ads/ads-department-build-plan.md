# Autonomous ads department: implementation plan

Date: 2026-09-23. Status: runtime and guarded provider surface implemented; authenticated acceptance and broader autonomous workflows remain. See [current setup and precise limitations](../guides/departments-quickstart.md). The inspection table below records the original baseline, not the current code. The shared module boundary is defined in [the modular departments plan](../architecture/modular-departments-plan.md).

## Outcome and scope

Build the ads department as one independently usable, on-demand module within the marketing harness. Every other department follows the same module contract and lazy activation rule. Ads can research, plan, create, launch, measure, experiment, optimize, and report across Meta, Google Ads, and GA4 without starting other departments. The marketing harness and an external DeepSeek harness consume the same ads module. Deliver the complete Meta lifecycle first, then expand Google and GA4 coverage. DeepSeek provides planning and interpretation; typed tools execute platform operations; the module owns ads workflows and results.

The requested 150+/80+/20+ tool counts are coverage ambitions, not verified inventories. Track supported operations and tested workflows rather than inflating tool counts. Platform permissions, account eligibility, and API support determine which operations can execute.

This plan changes no live account settings. No authenticated platform testing was performed. Only this repository was inspected; a separate external DeepSeek harness, if one exists, still needs its integration contract confirmed.

## 1. What exists and what must change

| Existing location | Observed implementation | Required work |
|---|---|---|
| `src/mcp/mcp-client.ts` | In-process registry and dispatcher; parameters are loose objects | Reuse dispatcher; validate inputs/outputs, attach capability metadata; expose a real transport for external consumers |
| `src/mcp/direct/direct-adapter.ts` | Partial direct adapters; many registrations pass tool names where server IDs are required | Repair registration and add credential-enabled registry tests |
| `src/mcp/mcp-registry.ts` | Registers mocks first, then overrides selected handlers | Explicit simulation mode; missing live credentials must report unavailable, never fall back to mock success |
| `src/mcp/direct/meta-ads-client.ts` | Partial reads/creates; status and budget updates use account collection paths; insights paths/encoding need correction | Verify request contracts against the pinned API; update object-specific operations, pagination, media uploads and delivery verification |
| `src/mcp/direct/google-ads-client.ts` | Uses `/customers:ID/…`; mutation shapes and negative keyword resource need correction | Correct REST paths, update masks, criteria operations, pagination, and actual response decoding |
| `src/mcp/direct/ga4-client.ts` | Wraps report body in `reportRequest`; property summaries decoded at wrong level | Send documented report body; decode nested account/property summaries; implement offset pagination |
| `src/core/deepseek/deepseek-brain.ts` | Keyword routing, timed stages, fabricated approval events and templated deliverables | Connect stages to real tasks/results; remove synthetic success and synthetic approvals from production execution |
| `src/core/task-engine/task-engine.ts` | Executes skills; later execution/monitoring transitions do not dispatch a deployment plan | Persist and execute explicit operations, resume after approval, verify remote results |
| `src/agents/paid-ads/meta-ads-agent.ts` | Meta agent runs one fatigue analysis skill; Google agent assumes mock response fields | Expand capability routing; consume validated live contracts, including empty data |
| `src/skills/marketing/*.ts` | Ad analysis/optimization contain fixed IDs, recommendations, performance claims and success summaries | Derive targets and conclusions from evidence; propagate pending/failed/partial statuses |
| `src/mcp/write-gate.ts` | Creates new approval on each call; default action levels force review; edited approval does not return edited execution payload | Durable operation identity, resumable decisions, payload binding, and explicit standing execution policy |
| `src/approvals/hitl-manager.ts` | Approval records held in process maps/history | Persist decisions and consume each authorization against its exact operation |
| `config/ads.yaml` | All platforms off; GA4 modeled as read-only | Separate reporting/admin capabilities and transport mode from execution policy |
| `tests/ads/ads-direct.test.ts` | Basic config/token/gate checks; no platform request-contract coverage | Add realistic response fixtures and lifecycle tests |

The direct response contracts also differ from what existing callers expect: Google analysis expects `searchTermsSummary`; Meta analysis expects qualified leads and a diversity score; GA4 analysis expects funnel outputs absent from its direct adapter. Audit every caller when changing these contracts.

Measurement defects to fix early: Google conversion value is currently treated as micros; analysis uses only the first Google campaign; qualified-lead cost is labeled CAC; ARR is used as if it were realized revenue. Missing values must remain unavailable, not become fabricated defaults.

Repository tooling note: `git status` fails because `D:/.git/index` is invalid. Repair repository ownership/index separately before implementation branches; do not reset the surrounding drive repository.

## 2. One execution system for both harnesses

```text
Owner goal / dashboard / external DeepSeek harness
                       |
          Ads task and campaign brief
                       |
       Existing agents + executable skills
                       |
      Typed tool registry + execution policy
                       |
       Meta / Google Ads / GA4 API clients
                       |
    Receipts + remote state + metrics + CRM
                       |
        Measurement -> decision -> next task
```

Keep TypeScript, installed Zod, native fetch and reusable execution logic. The ads module must not call `initializeMarketingHarness()` or require the global agent registry, full MemoryManager, visualization engine or marketing orchestrator. Reuse existing task, approval and audit logic through explicit dependencies; the marketing host can supply its context and event sink. Standalone use supplies only ads configuration, storage, credentials and the execution services it actually needs. Add modules only where the current code has no equivalent.

For the built-in brain, add a real model/tool-call loop and dispatch stages through the task engine. For a separate DeepSeek harness, expose the same registry through a small standards-compliant MCP server, initially local stdio; use the official protocol SDK rather than implementing the protocol manually. The external harness owns its model loop. Both paths call the same validated handlers and execution policy. Never duplicate platform business logic between them.

Expose only relevant tool groups for a task: discovery/account setup, reporting, campaign building, audiences, measurement, or optimization. Discover additional groups on demand. Do not put hundreds of complete schemas into every planning request.

Each tool definition needs: name, platform, input/output schema, required permissions, read/write classification, supported account/object types, API version, and availability status. Distinguish implemented, contract-tested, live-verified, unavailable and unsupported. An arbitrary HTTP tool must not become an escape hatch around these contracts.

Tool results carry status, account/object IDs, source mode, fetch time, date range, currency/timezone where relevant, provider request ID where supplied, data, warnings and structured errors. API acceptance and verified delivery are separate outcomes.

### Module boundary and activation contract

The user explicitly requires independent use and activation only for ads work. This requirement applies to initialization, model context, credentials, network calls and scheduled jobs.

Start with one module entrypoint at `src/departments/ads/index.ts`, published through a dedicated package subpath such as `autonomous-marketing-harness/ads`. Keep it in this repository initially; a separate repository, service fleet or general-purpose plugin framework is unnecessary. The subpath must not import the root barrel, which currently exports and initializes broad harness components. Internal files can remain in their existing locations while their dependencies are decoupled; do not duplicate clients just to create a folder boundary.

Proposed public surface:

- `createAdsDepartment(options)`: constructs an isolated ads runtime with selected platforms and explicit business/account context; performs no network calls on import or construction.
- `listCapabilities()`: describes enabled operation families and availability without starting unrelated integrations.
- `run(task)`: performs an ads workflow, loading only the required providers and skills; returns a persisted task/result identifier and actual execution status.
- `resume(taskId)`: continues persisted work using the existing operation journal and decisions.
- `close()`: stops accepting work, settles or checkpoints active operations and closes local resources. It does not pause campaigns on the provider.

These are proposed interfaces, not implemented exports. The MCP entrypoint exposes the same capabilities to an external DeepSeek harness. Direct TypeScript use, standalone CLI and marketing-host integration all use this implementation.

The marketing host registers a lightweight ads capability description at startup. An explicit ads request or a planned task with an ads capability dynamically imports and initializes the module once. Concurrent requests share the same host initialization promise. Use structured capability routing rather than substring matching such as `includes('ad')`; general writing, SEO, email and organic social requests do not activate ads.

Within the module, selecting Meta does not require Google credentials, initialize a Google client or load all Google tool schemas. GA4 and CRM are requested dependencies for measurement workflows; they are not mandatory for listing Meta campaigns. Missing measurement access produces an explicit incomplete capability/result, without initializing the rest of the marketing organization.

Ads owns campaign specifications, assets/references, operations, optimization decisions and ads jobs. Business/brand context is supplied as an input snapshot; CRM, media generation and general analytics are optional integrations. Full GA4 configuration remains available as a capability group but loads only when requested. Shared business context does not require loading all ten memory subsystems.

Standalone use can run a scoped job and exit, or serve tools to DeepSeek. Continuous monitoring is an explicit ads job with persisted schedule and stop conditions: the host scheduler or a standalone worker wakes the module only when that job is due. Starting the general harness does not automatically create ads polling jobs. Closing the process leaves externally running campaigns unchanged; stopping campaign delivery is a separate ads operation.

Required changes to current eager wiring:

| Current entrypoint | Modular behavior |
|---|---|
| `src/index.ts` | General initialization does not initialize the ads runtime; provide independent ads subpath |
| `src/agents/agent-registry.ts` | Register ads role descriptors initially; instantiate ads agents on demand |
| `src/mcp/mcp-registry.ts` | Separate ads tool registration from unconditional global tool registration |
| `src/skills/index.ts` | Register ads workflow skills through the module loader |
| `src/workflows/daily-loop.ts` | Run ads work only for explicit due jobs or ads tasks |
| `src/core/deepseek/deepseek-brain.ts` | Route an ads task to the module and use its real result |
| `src/agents/base-agent.ts`, task/approval services | Remove global marketing initialization from the ads dependency path |
| Visualization hooks | Optional host event callback; standalone use has no dashboard requirement |

Acceptance tests: a non-ads task starts no ads clients or jobs and needs no ads credentials; standalone Meta works without the marketing initializer or Google/GA4 configuration; concurrent activation creates one host instance; importing the subpath has no network/timer side effects; repeated task resume does not repeat completed writes; closing a module preserves remote campaign state and persisted jobs.

## 3. Complete capability backlog

| Platform / family | Operations to deliver | Completion evidence |
|---|---|---|
| Meta campaigns | Discover/read/create/update/pause/resume/archive/delete; supported objectives and campaign budget modes | Campaign lifecycle verified remotely; objective/account eligibility checked |
| Meta ad sets | Budget, schedule, placements, optimization, billing, bids, promoted object and audience controls | Valid campaign/ad-set combinations; budget owner identified |
| Meta creatives and ads | Image/video upload and processing; creative/ad creation; updates/status; carousel, collection and existing-post ads | Assets ready, correct Page/Instagram identity, creative linked, review/delivery status read back |
| Meta audiences | Custom audiences, remarketing, lookalikes, supported targeting discovery, exclusions and customer uploads | Audience readiness, permission/terms checks, upload result and deletion handling |
| Meta leads | Forms, test leads, retrieval, webhook ingestion, CRM mapping and deduplication | Test lead reaches CRM exactly once; qualified outcome reconciles to source |
| Meta catalogs | Catalogs, feeds, ingestion jobs, products, product sets and diagnostics | Feed error surfaced; eligible set linked to campaign |
| Meta insights | Account/campaign/ad-set/ad metrics, compatible breakdowns, daily history, async reporting | Pagination/job completion; aligned window and attribution settings |
| Meta Pages | Page discovery, posts, promotable posts, boosted posts and Page insights | Correct Page access; supported post promoted and measured |
| Meta business | Business info, users/assets, Pages, Instagram identities, pixels/datasets | Asset access inventory; supported changes separately scoped |
| Meta measurement and experiments | Pixel/CAPI setup guidance and event sending, deduplication, diagnostics; experiment plans and eligible platform tests | Event IDs deduplicate; outcome feedback and experiment readout supported |
| Google campaigns | Search, Display, Shopping, PMax, Demand Gen, Video and App operations where API supports them | Separate create/read/update/delete support matrix per campaign subtype |
| Google keywords | Planner ideas, historical volume/CPC/competition, forecasts where available; keyword CRUD | Geography/language/date context retained; unavailable metrics explicit |
| Google bids/budgets | Shared budgets, portfolio strategies, campaign budgets, supported device/location/schedule adjustments | Shared-resource impact and strategy compatibility checked |
| Google ads/assets | Responsive Search, Display, Demand Gen, App; PMax asset groups and supported video assets | Format-specific requirements; disapprovals and asset status reported |
| Google audiences | Custom segments, remarketing, Customer Match, combined audiences where supported | Eligibility, terms and asynchronous upload errors handled |
| Google analytics | Campaign/ad-group/keyword/ad metrics, search terms, conversion value, ROAS | Valid GAQL, complete pagination, privacy omissions preserved |
| Google extensions/assets | Sitelink, callout, call, image, price, promotion, structured snippet, lead form | Create and link assets at supported scopes |
| Google experiments | Create/schedule/read/promote/end supported experiments | Supported type and rollout semantics validated |
| Google negatives | Campaign criteria, shared sets and associations; evidence-based suggestions | Suggestion separate from execution; match types preserved |
| Google organization | Labels and supported resource associations | Idempotent application/removal |
| Google conversions | Actions, uploads/adjustments, custom variables and value rules | Upload eligibility, consent fields, partial failures and receipt reconciliation |
| GA4 reporting | Standard, pivot, realtime, metadata and compatibility checks | Correct pagination; thresholds, sampling and quota metadata retained |
| GA4 audience/configuration | Audiences, channel groups, supported segment analysis, streams, enhanced measurement and retention | Separate Data/Admin API contracts; mark UI-only or unavailable features explicitly |
| GA4 attribution/events | Attribution settings and supported model configuration; key events | Supported Admin operations; do not promise arbitrary attribution models |
| GA4 integrations/annotations | BigQuery, DV360, Search Ads, Firebase and Google Ads links; reporting annotations | Version/access requirements validated for each resource |
| Cross-platform | Side-by-side performance, spend/conversion reconciliation, ROAS and allocation recommendations | Comparable currency, period, attribution basis and nonduplicated revenue |

Google documents write restrictions for some Video campaign types. Represent those as unsupported/manual steps; the tool count cannot override API restrictions. [Google campaign support](https://developers.google.com/google-ads/api/docs/campaigns/overview).

GA4 reporting and configuration require separate API surfaces. Audience/configuration resources, integrations and annotations must be checked individually against the available Admin API version. [GA4 Admin API](https://developers.google.com/analytics/devguides/config/admin/v1).

## 4. Make the department an operator

Reuse the existing Meta, Google, creative, analytics and reporting roles. Implement these as skills/workflows before adding more always-running agents:

1. Account onboarding: assets, identities, permissions, currency, timezone, destinations, conversion events and business constraints.
2. Strategy brief: product, offer, ICP, geography, business objective, qualified conversion, target economics, budget and evidence.
3. Campaign design: objective, structure, audiences, placements, bid strategy, tracking and experiment hypothesis.
4. Creative production: distinct concepts, copy, image/video brief or generation, format adaptation and asset validation. Use approved product facts; do not invent proof or testimonials.
5. Launch: dependency-ordered creation, remote verification, activation and delivery monitoring.
6. Measurement: spend, funnel, qualified leads, sales, revenue and conversion lag.
7. Optimization: evidence-based changes with a baseline, expected effect, observation window and stop condition.
8. Learning/reporting: record actual results, failed hypotheses and reusable findings, with source references.

Replace the fixed “Andromeda diversity score” with a clearly named internal creative-diversity heuristic if useful. Do not imply access to a proprietary Meta score or treat a heuristic as platform telemetry.

Persist a campaign brief, desired campaign specification, asset manifest, operation journal, metrics snapshots, decision records and experiment results. Use existing memory for business context and narrative learning. Use a small transactional SQLite store for operations, approvals and scheduler state; decide driver from the actual supported Node runtime. This is needed for restart recovery and concurrent budget decisions, not for speculative scale.

## 5. Autonomy that can finish unattended

Separate `simulation / live-read / live` transport from an account-specific execution policy. Standing policy can authorize routine launches and optimization inside an agreed campaign plan, account scope and total budget. Only exceptions need individual review. Exact monetary limits and allowed actions remain owner settings, not model-generated permissions.

Policy includes allowed accounts, campaign scope, spend envelope, permitted change size, change cooldown, minimum evidence, tracking freshness, allowed creative sources and stop conditions. New authority over business users/assets and destructive actions need separate treatment from routine campaign optimization.

Extend WriteGate into the shared enforcement point for every caller: agents, CLI, scheduler, dashboard and MCP. Check schema, account ownership, permissions, latest remote state and policy immediately before dispatch. A model cannot change the policy that authorizes its own operation.

Persist operation transitions:

```text
planned -> validated -> authorized / awaiting_decision
        -> dispatched -> verified / failed / uncertain
```

Use a stable operation ID and payload hash. Reuse an existing decision on resume. An edited payload is revalidated and is the payload actually dispatched. After an ambiguous create timeout, reconcile remote objects before retrying; a local idempotency key alone cannot guarantee platform exactly-once execution. Persist each created ID so a partial launch resumes without recreating its parents.

Use per-account serialization for competing budget changes. Track committed budgets and in-flight changes, currency units and timezones. Actual platform spend can lag reporting and exceed a naive daily pacing target; combine available platform controls with conservative pacing and pause rules rather than promising an instantaneous hard cap.

Use bounded retries with jitter for retryable requests, cursor/offset pagination, request deadlines, token renewal where supported, and actionable reauthorization failures. Redact secrets and customer data from model context and logs. Customer-match uploads and conversion identifiers follow provider consent and hashing requirements.

## 6. Measurement and optimization rules

Keep three views: platform-attributed performance, GA4-attributed performance and deduplicated CRM/order revenue. Never sum Google and Meta attributed revenue and call it unified revenue. Match campaign IDs/UTMs, eligible click identifiers and CRM/order identifiers; retain attribution window and model with each metric.

Define ROAS as attributed revenue divided by matched spend; CPQL as spend divided by qualified leads; CAC as acquisition spend divided by new customers. Zero denominators produce unavailable ratios. ARR/pipeline value must be named separately from realized revenue. Record FX source/date when converting currencies; otherwise compare within currency.

For B2B lead generation, qualification and sales feedback must drive optimization alongside CPL. Build CRM integration as part of the Meta milestone: this repository's CRM integration is currently simulated.

Start with configurable rules and explainable proposals: pacing, tracking outages, disapproved ads, creative fatigue using time series, and experiment conclusions. Respect conversion lag, sample sufficiency, learning state and change cooldowns. CTR/frequency alone must not trigger unconditional shutdown. Budget recommendations must account for marginal performance and uncertainty, not just historical ROAS rankings.

## 7. Delivery sequence and acceptance gates

| Phase | Deliverable / principal files | Acceptance gate |
|---|---|---|
| 0a. Module boundary | Ads entrypoint/package subpath; split eager agent/tool/skill wiring; explicit dependencies | Ads-only runtime works independently; non-ads startup triggers no ads initialization/network/jobs |
| 0. Repair foundation | `mcp-client.ts`, `mcp-registry.ts`, `direct/*`, affected skills and API reference docs | Live-mode registry initializes with fixture credentials; correct request/response contracts; missing credentials and partial results cannot report success |
| 1. Real execution | `deepseek-brain.ts`, `task-engine.ts`, `write-gate.ts`, `hitl-manager.ts`; small journal and MCP entrypoint | One tool works from external harness and dashboard; restart/resume works; decisions bind exact payload; synthetic success absent |
| 2. Meta lead-gen lifecycle | Meta client/tools, paid-ads skills, creative/CRM connections | Brief -> media -> paused campaign/ad set/ad -> activation under policy -> review/delivery monitoring -> lead -> qualified outcome -> report |
| 3. Meta full coverage | Audience, catalog, Pages, business, advanced creative and reporting families | Capability backlog exercised by contract tests; eligible account workflows live-verified; unsupported capabilities labeled |
| 4. Google coverage | Corrected Google client, tool families and Google agent workflows | Search first, then other eligible campaign types; keywords/assets/bids/conversions/experiments independently accepted |
| 5. GA4 and reconciliation | Corrected Data client, new Admin client, attribution/reporting skills | Data/Admin reporting works; conversion definitions align; revenue deduplication and comparable ROAS verified |
| 6. Continuous operation | Existing scheduled loops, persisted jobs, dashboard events | Restart recovery, stale-data halt, partial failures, cooldowns and several complete observe/change/measure cycles validated |

Basic GA4 and CRM measurement enter Phase 2; Phase 5 completes breadth. Execute phases as small reviewable changes, starting with the module boundary (0a) and integration repairs (0). No reliable calendar estimate until account access, media generation, CRM and external harness requirements are confirmed.

Proposed first implementation ticket: establish the independent ads entrypoint and lazy host activation, with tests proving non-ads work does not initialize ads. Then repair registry IDs and platform request contracts, replace silent mock fallback, reconcile caller result schemas and add offline contract tests. Do not enable live writes as a side effect of those fixes.

## 8. Verification and launch requirements

Reuse Vitest. Add representative request/response fixtures for each resource family; cover empty accounts, pagination, wrong scope, expired credentials, rate limits and partial failures. Keep a small end-to-end fake-provider lifecycle proving resume after crash, no duplicate creation after uncertain response, exact edited-payload dispatch and no false completion.

Run build/tests locally. Then verify reads in a designated account; create paused objects only within the designated test scope; verify the complete workflow before activating an agreed budget. Unit tests cannot prove platform eligibility, approval or delivery.

The dashboard should show connection/access status, capability readiness, current brief, campaign tree, spend, pending decisions, delivery issues, changes with reasons, and measured outcomes. Source every status from real task/provider state. Existing 3D office animation can display those events.

Implementation inputs: Meta business/ad-account/Page/Instagram/dataset IDs and suitable app/token access; Google customer/MCC IDs and developer/OAuth access; GA4 property access; CRM and conversion definitions; creative generation/storage; execution budget/policy; external DeepSeek harness transport if separate. Credentials belong in environment/secret storage, never in the plan or model prompt.

## 9. Documentation corrections and official references

The existing `docs/ads/ads-api-integration-reference.md` contains inaccuracies and must not serve as the implementation contract. In particular, Google search uses `/customers/{id}/googleAds:search`, with fixed-size pages and page tokens. [Google REST search](https://developers.google.com/google-ads/api/rest/common/search).

GA4 standard reports accept the report fields directly and use `offset`/`limit`; the documented per-request maximum is 250,000 rows, not the existing document's 100,000. [GA4 runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).

Meta's official Business SDK is a reference for Marketing, Pages and business object coverage. Pin and validate individual request schemas; old examples are not a guarantee of current permissions/objectives. Direct Meta documentation retrieval failed during this planning pass, so detailed Meta fields, access requirements and API-version compatibility still require verification in Phase 0. [Meta official SDK](https://github.com/facebook/facebook-nodejs-business-sdk).
