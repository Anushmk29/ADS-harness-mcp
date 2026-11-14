# Modular departments: run and test

Implemented on 2026-09-23. Start here; the older design documents are a roadmap, not proof of live capability.

## What is runnable

Eight independently importable departments: `ads`, `analytics`, `research`, `content`, `blog`, `email`, `social`, and `hq`. Construction/discovery does not start sibling departments, timers or network requests. HQ routes exact capability IDs and activates only the owner.

The ads/analytics catalogue has 149 operations: 69 Meta/ads-workflow tools, 44 Google Ads tools, and 36 GA4 tools. Resource-level operations intentionally cover multiple campaign/ad formats instead of manufacturing hundreds of aliases. Every tool is marked `implemented-not-live-verified` until authenticated acceptance testing. Provider-specific payload fields beyond the common schema are validated by the provider, not exhaustively by this SDK.

Meta includes campaign/ad-set/ad/creative/audience management, media upload, labels, catalogs/feeds/product sets, leads/test leads, Page posts, account/business asset reads, insights, conversion events and a resumable paused launch workflow. Google includes GAQL reporting, keyword planning, resource mutations for campaigns/bidding/budgets/ads/criteria/assets/audiences/labels/conversions/experiments, experiment actions and customer-match jobs. GA4 includes Data reports and Admin audiences/channel groups/streams/key events/annotations/integration reads/settings, including enhanced measurement.

Other departments wrap the existing skills. They are modular, but this does **not** turn their old templates or simulated research/CMS/email/CRM connectors into production integrations. Live calls to missing connectors fail explicitly. LinkedIn currently stages local drafts, not live publication. Do not use legacy simulated results as business evidence.

## 1. Local tests — no account credentials needed

Use Node **24+** (built-in SQLite) and pnpm. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:mcp
node bin/department.js ads capabilities
node bin/department.js ads tools
node bin/department.js ads run examples/departments/compare.json
```

The last command uses explicitly labelled example inputs; expected blended ROAS is **2.5**, with the repeated order counted once. It makes no network request. The automated suite uses injected provider responses; the MCP smoke test starts an actual stdio subprocess and checks scoped discovery/execution.

Verified locally: TypeScript build, **87 tests across 15 files**, MCP stdio smoke, and the comparison CLI example.

## 2. What you need to provide

Keep credentials in a secret store or local `.env` copied from `.env.example`. Do not paste tokens into chat, task JSON, policy YAML or committed files. Node loads this file only when invoked with `--env-file=.env`; it is not auto-loaded by npm commands.

| Connection | Needed from you |
|---|---|
| Meta first | Authorized token in `ADS_DIRECT_META_ACCESS_TOKEN`; actual ad-account ID; permission to the relevant Page/Instagram account. Full ads also need approved copy/media, destination URL, objective, targeting, budget/currency, applicable special-ad categories, and conversion/pixel setup where relevant. Catalog/lead/Page operations require access to those assets. |
| Google Ads | `ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN`, customer ID without hyphens, OAuth access token OR refresh credentials below; manager login customer ID if applicable. Merchant Center/product data or app/media assets are still required for campaign types that use them. |
| GA4 | Property ID and an authorized access token OR refresh credentials; read scopes for reporting, edit scopes/property permissions for Admin writes. |
| Google refresh | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, plus `ADS_DIRECT_GOOGLE_REFRESH_TOKEN` and/or `ADS_DIRECT_GA4_REFRESH_TOKEN`. Access tokens take precedence: remove stale access-token values when using refresh. |
| Built-in DeepSeek runner | `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` available to your account. Not needed if an external harness already supplies the model. |
| Business instructions | Correct `config/business.yaml`; actual offer/claims, audience/geography, success metric, target economics, approved creative, consent rules and spend limits. Existing example company claims are not verified facts. |

Start with **Meta only**; Google and GA4 are optional until those tools are needed. Meta token renewal is operator-managed. No OAuth browser onboarding wizard is included in the new module.

## 3. Read-only connection test

```powershell
node --env-file=.env bin/department.js ads run examples/departments/meta-accounts.json
```

Expect accessible account IDs from Meta. A permission/token error must be fixed before writes. Dry-run mode blocks writes, **not reads**; reads contact the provider when requested.

## 4. First reviewed, paused write

Edit `config/ads-module.yaml`: set `mode: live-with-approval` and add your account ID to `accounts.meta` as a quoted string, such as `meta: ['123456789']`; YAML can otherwise treat it as a number and lose digits. Replace the placeholder account in `examples/departments/meta-paused-campaign.json`. Creation is forced to `PAUSED`. Use a new stable `operationId` for a new action; reuse it only for the exact same action.

```powershell
node --env-file=.env bin/department.js ads run examples/departments/meta-paused-campaign.json
# Expected: PENDING_APPROVAL, with exact provider/account/object/payload binding. Inspect it before approval.
node --env-file=.env bin/department.js ads approve first-paused-test-1
node --env-file=.env bin/department.js ads resume first-paused-test-1
```

Approval alone sends nothing; `resume` dispatches. Expect a provider campaign ID. Verify it in Ads Manager and with `meta_ads_get_campaign` (fields `id,name,status,effective_status`). It must remain paused. API acceptance does not prove review approval, delivery, tracking accuracy or conversions. Activation is a **separate** explicit reviewed update. No live changes were made while building this module.

`ads_launch_meta` binds campaign → ad set → creative → ad to one exact-payload approval, creates every delivery object paused, and reads every object back before returning `VERIFIED`. Activation is a separate approved update. Supply real media and Page references. There is no universal campaign template that is valid for every objective/account.

## 5. Connect an external DeepSeek harness

Any host that supports MCP stdio can start the server below. Adapt the host's configuration format, keeping these command/argument/cwd values; this is a standard MCP example, not a claim that an uninspected external harness has this exact configuration UI.

```json
{
  "mcpServers": {
    "marketing-meta": {
      "command": "node",
      "args": ["--env-file=.env", "bin/mcp.js", "ads", "meta"],
      "cwd": "D:/Autonoetic_edge/Vijendra pratap/marketing-harness"
    }
  }
}
```

Use `ads google` for Google, `analytics ga4` for GA4, or omit the platform to expose that department's full catalogue. **Start the server on demand in your host**; do not eagerly attach all departments. A Meta-scoped server does not expose Google tools or cross-platform skill execution. Approval commands are not exposed to the model. Do not give an untrusted model shell access to approval commands, credential files or policy configuration.

Alternatively, use the built-in model loop:

```powershell
node --env-file=.env bin/ask.js "Use the ads department to list my accessible Meta ad accounts. Do not make changes."
```

The loop discovers schemas, executes only discovered capabilities, and reports real results. It does not fabricate approvals or completion. It is bounded to 20 turns by default. Dashboard sessions use the same runner. Conversation/session execution is not automatically resumed after a process restart; durable provider operations can be resumed by ID.

Direct Node embedding after build:

```javascript
import { createAdsDepartment } from 'autonomous-marketing-harness/ads';
const ads = createAdsDepartment();
try {
  console.log(await ads.run({ capability: 'meta_ads_list_accounts', input: {} }));
} finally { await ads.close(); }
```

## 6. Controlled automation

`config/ads-module.yaml` is the authoritative policy for new tools:

- `off`: validate proposed writes without dispatching or persisting them.
- `dry-run`: validate proposed writes without dispatching; no provider-side validation is implied.
- `live-with-approval`: persist the exact operation, require human approval, then dispatch only on `resume`.
- Legacy `review` and `autonomous` values are migrated to `live-with-approval`; autonomous provider writes are disabled in v1. Write accounts must be allowlisted, and non-account assets use `allowedObjects`.
- `maxBudgetPerWrite`: ceiling for recognized budget/bid fields, in Meta minor currency units or Google micros. This is **not an aggregate spend cap**. Keep provider-side account/campaign limits and initial paused status; do not enable unsupervised spend without account-level controls.

State lives under `.marketing-data/ads/operations.sqlite`. Protect this directory with OS permissions and backup/encryption appropriate to lead/customer data. Payloads/results are not encrypted by the application. The durable lifecycle is `DRAFT → PENDING_APPROVAL → AUTHORIZED → DISPATCHED → VERIFIED`, with terminal `REJECTED`, `FAILED`, `PARTIAL`, and `UNCERTAIN` states. Dispatch claims use a one-minute lease so a concurrent worker cannot resend or prematurely mark an in-flight request uncertain. `UNCERTAIN` means a request may have reached the provider: inspect the account before any further write, never mint a new ID just to retry. `PARTIAL` requires inspection of individual operation results. `DISPATCHED` with an asynchronous provider operation is accepted but not yet verified. There is no automatic uncertain-write reconciliation, global rollback or end-to-end exactly-once guarantee. Deletions follow provider semantics and may be irreversible.

Jobs run only when explicitly registered and invoked. Job JSON fields: `id`, `department`, `capability`, `input`, `nextRunAt` (Unix milliseconds), optional `intervalMs` (at least 60000).

```powershell
node bin/jobs.js add path-to-your-job.json
node --env-file=.env bin/jobs.js run-due
node bin/jobs.js list
node bin/jobs.js pause your-job-id
```

Have your external scheduler invoke `run-due`; importing a module never starts background work. Successful interval jobs recur; waiting/failed/uncertain jobs stop for inspection. A crash leaves a claimed job `RUNNING` rather than automatically replaying a possible write. Scheduled provider writes derive stable IDs from job ID and due time. Review approvals remain operator work.

The dashboard binds to localhost. Remote access requires `HARNESS_KEY`; department API access additionally accepts its configured `MARKETING_API_TOKEN` bearer gate. Keep the service local unless you have a secure reverse proxy and access controls. Legacy skills that call legacy ads aliases still use `config/ads.yaml`; prefer the new exact tool IDs and `ads-module.yaml` for new workflows.

HTTP discovery is `GET /api/departments/catalog`, tool schemas are `GET /api/departments/{id}/tools`, and execution is `POST /api/departments/{id}/run` with the same task JSON as the CLI. The existing `/api/departments` office-layout response remains unchanged.

## 7. Meta Ads MCP tools (`meta_mcp_*`)

The harness can also call all 91 tools on Meta's official Ads MCP server (`https://mcp.facebook.com/ads`, open beta). These add things the Graph API path doesn't have: opportunity score, benchmarks, anomaly signals, dataset quality, delivery errors, A/B and lift tests, activity logs, Help Center search and catalog diagnostics. The harness calls Meta's server directly with a bearer token. No chat app or OAuth login is involved.

- Turn them on with `ADS_META_MCP=on`. They are off by default.
- They use the same `ADS_DIRECT_META_ACCESS_TOKEN`, which needs these extra scopes: `ads_mcp_management`, `ads_read`, `ads_management`, `catalog_management`, `business_management`, `pages_show_list`, `instagram_basic`.
- Input shape: `{ accountId, operationId?, arguments }`. `arguments` is passed unchanged to Meta's tool.
- Writes go through the same gates as everything else: mode, exact-payload approval, account allowlist, no `ACTIVE` status and `maxBudgetPerWrite`. Customer-list uploads accept only SHA-256 hashes. `meta_mcp_ads_activate_entity` is always refused: activate in Ads Manager.
- **Writes stay refused until the live snapshot is taken.** The snapshot tells us which argument holds the ad account id. To take it, run `pnpm build && node --env-file=.env bin/meta-mcp-snapshot.js`, then set `accountParam` for each write in `src/modules/ads/meta-mcp/mapping.ts`.
- Re-run the snapshot script to pick up changes Meta makes. A new tool stays hidden, and `tests/ads/meta-mcp.test.ts` fails, until it is classified in the mapping.

## Remaining work before claiming A–Z production automation

- Authenticated acceptance tests for **each** required account, objective, creative format and API operation; some API/account features are restricted. Generic resource mutations are not a promise that every UI feature or Video campaign can be created through the API.
- Genuine creative production integrations, asset QA, landing-page QA, tracking validation, customer-data consent/normalization and CRM/order reconciliation. Upload tools alone do not provide these.
- Evidence-based budget allocation/negative-keyword suggestions and unattended optimization with aggregate spend controls; the current measurement tools compare supplied evidence and suggest creative review, not automatic profitability.
- Production connectors for the other departments, custom dashboards for the new approval journal, session restoration, reconciliation/alerts and operational deployment monitoring.

No feature is represented as live-verified merely because it has a tool definition. The full requested vision remains in the build plan; this delivery supplies the executable modular runtime and guarded provider surface for testing that vision.
