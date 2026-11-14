# Direct Ads Integration — Operations Guide

This module bridges the marketing harness to **real** Google Ads, Meta (Facebook/Instagram)
Ads, and Google Analytics 4 accounts using **self-hosted, first-party API calls**. There is
**no third-party proxy** in the path — every request goes straight from this process to the
platform. This is the "Option B" (direct official SDKs) integration.

It replaces the built-in **mock/simulated** Google/Meta/GA4 MCP tools **only when you enable
it**. By default everything stays on the safe mock mode.

---

## 1. How it works

Relevant layout:

```
mcp/
  ads-config.ts            loads config/ads.yaml (mode per platform)
  write-gate.ts            HITL gate protecting every live mutation
  auth/
    token-store.ts         persists OAuth tokens to .marketing-data/oauth/ (git-ignored)
    oauth-loopback.ts      localhost OAuth PKCE redirect listener
  direct/
    direct-adapter.ts      exposes compatibility MCP tool names
departments/ads/
  transport.ts             shared Google, Meta and GA4 HTTP transport
  tools.ts                 validated provider tool catalogue
  service.ts               policy, approval and execution boundary
```

`initializeMCPRegistry()` first registers the standard (mock) integrations, then calls
`registerDirectAdapters()`. When a platform's `config/ads.yaml` mode is `direct` or `dry-run`
**and** valid credentials are present, the mock tool handlers are **overwritten** with the
real client — the names stay identical, so zero agent / skill / loop code changes.

### Modes (per platform)
| mode | reads | writes |
|------|-------|--------|
| `off`     | mock (simulated) | mock |
| `dry-run` | **live**         | staged for HITL review, **never sent** |
| `direct`  | **live**         | require HITL approval, then **sent** |

---

## 2. Enabling a platform (example: Google Ads)

1. **Put your credentials in the environment** (never commit them):
   ```bash
   # PowerShell (or your shell)
   set ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN=<your google ads dev token>
   set ADS_DIRECT_GOOGLE_ACCESS_TOKEN=<oauth access token>
   ```
   See `.env.example` for all variable names.

2. **Set the mode** in `config/ads.yaml`:
   ```yaml
   ads:
     google_ads:
       mode: dry-run   # start here to verify reads before enabling writes
       writeLevel: 2
       defaultAccountId: <your_customer_id>
   ```

3. **Rebuild and verify**:
   ```bash
   npm run build
   node bin/cli.js ads-status      # shows configured/missing per platform
   node bin/cli.js status          # tool count should stay 22+
   ```

4. **Test reads live**, then flip `mode: direct` and run a write to see the HITL gate.

---

## 3. The WriteGate (money safety)

Every **mutating** tool (`google_ads_apply_negative_keywords`, `google_ads_update_budget_and_bids`,
`meta_ads_pause_fatigued_ad`, `meta_ads_create_campaign`) runs through `WriteGate.enforce()`:

- `dry-run` mode → returns a `dry_run` status; **nothing** is sent, stage is logged to the
  audit trail.
- `direct` mode → if the effective level `>= writeLevel`, an approval request is opened in
  `HITLManager` and the tool **waits** (`writeTimeoutMs`) for a human to `resolveApproval(...)`.
  Only `APPROVED` / `EDITED` / `APPROVED_WITH_PREFERENCE` lets the dispatch proceed.

Effective level = `max(configured writeLevel, default level for the action)` where defaults are:
- delete campaign/ad → **3**
- create campaign, update budget/bid → **2**
- pause ad, apply negative keywords, create adset/ad → **2**

This is stricter than the old behavior, where `daily-loop.ts` and the campaign-optimization
skill could fire write tools with **no gate**. Now a live mutation cannot happen silently.

> **Meta creative requirement:** a standard link ad via `object_story_spec` **requires an
> image or video** (there is no valid image-less link ad). The `meta_ads_create_creative_variation`
> tool therefore requires `imageHash` or `imageUrl` (plus `pageId`). `meta_ads_pause_fatigued_ad`
> and `meta_ads_create_campaign` also now require the ad-account id (or
> `ads.yaml meta_ads.defaultAccountId`).

---

## 4. APIs used (verified endpoints)

| Platform | Base | Auth | Write support |
|----------|------|------|---------------|
| Google Ads | `https://googleads.googleapis.com/v25/` (`customers:listAccessibleCustomers`, `googleAds:search`, per-resource `*:mutate`) | OAuth2 bearer + `developer-token` header (+ optional `login-customer-id`) | negative keywords, budget, campaign status |
| Meta Ads | `https://graph.facebook.com/v26.0/` | long-lived system-user token (`ads_management`, `ads_read`, `read_insights`); mutations are form-encoded | campaign/adset/ad CRUD, pause, daily budget |
| GA4 | `https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport` (100k row limit) | OAuth2 (`analytics.readonly`) | read-only |

> Full endpoint/bodies/field-reference is in [`docs/ads/ads-api-integration-reference.md`](ads-api-integration-reference.md)
> (verified 2026-09 against official Google/Meta docs).

> **Production access note (Google Ads):** the Google Ads API requires you to complete the
> API access-approval process ("obtain access approval") for production, beyond the developer
> token. Do that before expecting live writes. The GA4 Data API likewise requires either
> OAuth consent or a Google Cloud service-account connection depending on your configuration.

---

## 5. Testing

Tests run in **mock** mode (no network): they assert the harness still boots with 42 passing
checks, and that the MCP registry still exposes the 22 tools / 9 servers.

```bash
npm test          # vitest
pnpm test
```
