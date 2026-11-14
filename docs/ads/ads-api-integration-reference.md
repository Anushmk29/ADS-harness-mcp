# Direct API Integration Reference — Google Ads, Meta, GA4 (2025–2026)

Research only (no code). All facts verified against official developer documentation
fetched during this session. Doc pages cited inline; current as of the fetch dates noted.

---

## 1. Google Ads API (REST, current version = **v25**)

> ⚠️ **Correction to your assumption:** the current version in the base path is **`v25`**,
> not v19/v20/v21. Google's own REST docs (last updated 2026-09-10) use `v25` in every
> example (`/v25/customers:listAccessibleCustomers`, `/v25/customers/CUSTOMER_ID/googleAds:search`).
> The upgrade/versioning matrix lists v25 as the current release train (v25.2 banner on the
> metrics page). Pin your base path to `v25`.

### Base endpoints
- **OAuth token exchange:** `https://www.googleapis.com/oauth2/v3/token`
  (the `v3` there is the OAuth endpoint version and is unrelated to the Google Ads API version — it does not change.)
- **API base:** `https://googleads.googleapis.com/v25/`
- Example resource URL: `https://googleads.googleapis.com/v25/customers/CUSTOMER_ID/googleAds:search`

### OAuth 2.0 scope
One scope for both reading and writing: **`https://www.googleapis.com/auth/adwords`**
(confirmed in the REST auth docs for both user flow and service account flow).
There is no separate read-only vs read/write Google Ads scope for campaign access;
the same `adwords` scope covers listing, reporting, and mutating. (GA4 uses a different
scope — see §3.) Practical wraps: the OAuth token's effective permission is the token's
own grant + the Google Ads account/user access level (e.g. user must have manage access
to actually mutate).

### Required HTTP headers (REST)
```
Authorization: Bearer ACCESS_TOKEN        # OAuth2 bearer access token
developer-token: DEVELOPER_TOKEN          # your API developer token (exact header name, lowercase-with-dash)
login-customer-id: 1234567890             # OPTIONAL, no hyphens (MCC/manager ID) — required when acting as a manager on a client account
linked-customer-id: 9876543210            # OPTIONAL — partners acting on a linked advertiser (rare for self-hosted)
Content-Type: application/json            # for POST bodies
```
Notes:
- `developer-token` is mandatory on **every** request. Get it at `https://ads.google.com/aw/apicenter`.
- `login-customer-id` is **not** a `@`-prefixed header — there is no such `@kyxj`-style token. The required
  Google-maintained headers are exactly: `Authorization`, `developer-token`, and (conditionally) `login-customer-id` / `linked-customer-id`.
- Remove hyphens from IDs (`1234567890`, not `123-456-7890`).
- If your OAuth user is directly a user of the **client** account (not via a manager), you don't need `login-customer-id` at all.
- Response includes `request-id` header you can use when contacting support.

### Customer IDs & hierarchy
- **customer ID** = the 10-digit Google Ads account id (no hyphens in API calls).
- **login customer ID (MCC)** = the manager account id. When your token logs in as an MCC and you address a
  managed (client) account, send `login-customer-id: <MCC_ID>` on every request.
- **List accessible accounts:** `GET https://googleads.googleapis.com/v25/customers:listAccessibleCustomers`
  → returns `{ "resourceNames": ["customers/123...", ...] }`. This is the correct method name:
  `customers:listAccessibleCustomers`.
- **Get the hierarchy (MCC tree):** run a GAQL query against the `customer_client` resource, e.g.
  ```
  SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager,
         customer_client.status, customer_client.level
  FROM customer_client
  ```
  Traverse `level` and parent links (`customer_client` has no direct parent column in the report view; use
  the linkage approach: query each MCC's `customer_client` rows). There is a dedicated
  "Get account hierarchy" code sample in the official docs.

### Custom GAQL query (search)
Both `search` (paginated, 10,000-row pages) and `searchStream` (single streamed response) use the same base.

```
POST https://googleads.googleapis.com/v25/customers/CUSTOMER_ID/googleAds:search
Host: googleads.googleapis.com
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN
developer-token: DEVELOPER_TOKEN
```
Body:
```json
{
  "query": "SELECT campaign.id, campaign.name, campaign.status, ... FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31'",
  "pageSize": 1000,
  "pageToken": "OPAQUE_NEXTPAGE_TOKEN"   // omit on first page; echo response nextPageToken to paginate
}
```
- `search` returns fixed-size pages of up to **10,000** rows; a `nextPageToken` is returned when more rows remain.
- `searchStream` (`.../googleAds:searchStream`) streams everything in one response (result wrapped in a JSON array). No `pageToken`.
- Modern Google Ads Query Language (GAQL) replaces the old AWQL. Date-filtering uses standard `WHERE ... BETWEEN`/comparators —
  **confirmed syntax: `WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'`**.

### Exact GAQL field names (Google Ads API)
Metrics (prefix `metrics.`):
- impressions → `metrics.impressions`
- clicks → `metrics.clicks`
- cost → `metrics.cost_micros` (micros i.e. 1/1,000,000 of currency unit; divide by 1,000,000 for the unit) — there is also `metrics.cost` alias on newer versions but `cost_micros` is the canonical stored value
- conversions → `metrics.conversions`
- ctr → `metrics.ctr`
- cpc → `metrics.average_cpc` (average cost per click)
- cost per conversion → `metrics.cost_per_conversion`
- search impression share → `metrics.search_impression_share`
Campaign status → `campaign.status` (values `ENABLED`/`PAUSED`/`REMOVED`)
Segments date → `segments.date`

A campaign-level performance query:
```
SELECT campaign.id, campaign.name, campaign.status,
       metrics.impressions, metrics.clicks, metrics.cost_micros,
       metrics.conversions, metrics.ctr, metrics.average_cpc,
       metrics.cost_per_conversion, metrics.search_impression_share
FROM campaign
WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31'
ORDER BY segments.date
```

### Mutations (`:mutate`)
Most resources are mutated via **`POST .../{resource}:mutate`** with an `operations` array.
Each operation is exactly one of `create` | `update` | `remove`. URL derived from resource-name
pattern by dropping the trailing resource ID and appending `:mutate`.

Mutate base: `https://googleads.googleapis.com/v25/customers/CUSTOMER_ID/campaigns:mutate`
Similarly `.../campaignBudgets:mutate`, `.../campaignNegativeKeywords:mutate`,
`.../adGroups:mutate`, `.../adGroupNegativeKeywords:mutate`, `.../biddingStrategies:mutate`.

- **Create** requires a full resource JSON (no resourceName/ID in body).
- **Update** is a sparse update: include `updateMask: "field1,field2"` plus the changed fields and the `resourceName`.
- **Remove** sends only `"remove": "customers/CUSTOMER_ID/.../RESOURCE_ID"`.
- `partialFailure` is supported on most services to let individual ops fail independently.

Examples:
```json
POST /v25/customers/CUSTOMER_ID/campaigns:mutate
{ "operations": [ { "create": { "name": "Example", "status": "PAUSED",
    "campaignBudget": "customers/CUSTOMER_ID/campaignBudgets/BUDGET_ID",
    "advertisingChannelType": "SEARCH",
    "networkSettings": { "targetGoogleSearch": true, "targetSearchNetwork": true } } } ] }

// sparse update (change status / name / budget)
{ "operations": [ { "updateMask": "status",
    "update": { "resourceName": "customers/CUSTOMER_ID/campaigns/CAMPAIGN_ID", "status": "PAUSED" } } ] }
```
- **Budget change:** mutate `campaign_budget` (`.../campaignBudgets:mutate`) updating `amount_micros`
  (budget is expressed in micros too; e.g. $10/day → `10000000`). Budget links to a campaign via `campaignBudget.resourceName` on the campaign.
- **Bid strategy:** update the campaign's `bidding_strategy` fields or reference a portfolio `bidding_strategy`
  (`.../biddingStrategies:mutate`). Smart bidding is set via the `maximize_conversions` /
  `maximize_conversion_value` / `target_cpa` sub-objects on the campaign resource.
- **Negative keywords:** mutate `campaignNegativeKeywords` (campaign-level) or `adGroupNegativeKeywords`
  (ad-group-level); the keyword lives under `keyword.text` and `keyword.match_type`, type `NEGATIVE_KEYWORD`.
- **Pause a campaign:** the `update` op above setting `status: "PAUSED"` (or `REMOVED` to delete).
- **Add ad groups:** `.../adGroups:mutate` with a `create` of the ad group tied to a campaign.

### Production access / developer token approval
- You must have a **developer token**. Apply at `https://ads.google.com/aw/apicenter`
  (docs: `/google-ads/api/docs/api-policy/developer-token#apply-token`).
- Token tiers: **Test** (works only against test accounts under an MCC), then **Basic**
  (live accounts, API-imposed spend & rate ceilings), then **Standard** (production-scale).
- **Yes, production still requires an approval/access-obtainment process.** A Basic-or-higher token
  for live accounts requires Google's approval (they evaluate the business use case / policy compliance /
  linking your manager account). You do not get a Standard token silently; you apply for an access level
  and Google reviews it. For a self-hosted tool serving your own accounts, you'll typically obtain a
  **Basic** token by applying and linking your MCC, and may later request an upgrade to Standard.
- Test-mode calls use `https://googleads.googleapis.com/v25/customers/...` (same host/headers) against test
  customer IDs provisioned under your MCC; no token-approval needed to develop against test accounts.

---

## 2. Meta (Facebook/Instagram) Marketing API — Graph API

### Endpoint + version
- Base: **`https://graph.facebook.com/<API_VERSION>/`**
- Docs currently serve the reference at **v21.0**, but cURL examples on current reference pages use
  **`v26.0`** (e.g. `https://graph.facebook.com/v26.0/act_<AD_ACCOUNT_ID>?fields=...`). Pin to the latest
  stable numbered version Meta lists on its changelog; as of this research `v26.0` is what Meta's own docs
  show in the active cURL snippets. Always pass `access_token` as a query param (`?access_token=...`).

### OAuth & token types
- **App ID + App secret** (from Meta for Developers → app). Production-grade server integrations prefer a
  **System User access token** (create a system user in Business Manager, assign it to your asset/ad account,
  and generate a token with a long lifetime) so you're not tied to a person's login.
- **Short-lived token** (user): from the Login flow; ~1–2 h.
- **Long-lived token (user):** exchange a short-lived one —
  `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN` → long-lived (~60 days).
- **System User token** does not expire the same way as user tokens (it's tied to the app/system user and
  can be made permanent via Business Manager; app-scoped).
- **Page token:** `GET /<PAGE_ID>?fields=access_token` (needs `pages` / `pages_manage_ads` permission).
- **Permissions/scopes** for the Marketing API (include the relevant ones at token generation):
  `ads_management`, `ads_read`, `read_insights`, `business_management`.
  `ads_management` is required to read/create/manage ads; `ads_read` for read-only; `read_insights` for
  insights data; `business_management` for Business Manager / business-asset access.

### List ad accounts
Two primary paths:
- `GET /me/adaccounts?fields=name,account_id,currency&access_token=...` (accounts the current user/system user can access)
- `GET /<BUSINESS_ID>/client_ad_accounts` or `/act_<ACCOUNT_ID>/adaccounts` (Business Manager–scoped)
- Read a single account: `GET /act_<AD_ACCOUNT_ID>?fields=name,account_id,account_status,currency,minimum_budget`
The correct object id form is `act_<ACCOUNT_ID>`.

### Read campaigns / ad sets / ads / insights
Edges on the ad account:
- `GET /act_<ID>/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget`
- `GET /act_<ID>/adsets?fields=...`
- `GET /act_<ID>/ads?fields=...`
- Insights: `GET /act_<ID>/insights` (or `/act_<ID>/campaigns/insights`, `/adsets/insights`, `/ads/insights`)
  with confirmed fields:
  `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `unique_clicks`, `frequency`, `reach`,
  `actions`, `cost_per_action_type`, `date_start`, `date_stop`.
- **`time_range` param:** `?time_range={"since":"2025-01-01","until":"2025-01-31"}`
- **`breakdowns`:** `&breakdowns=ad_id,campaign_id,date_start,age,gender,placement` (comma-separated list).
- Insights return at most 37 months of history (error `3018` beyond that).

### Mutations (create / pause / budget)
All are `POST` to account edges with form-encoded params (`-F`), **not** JSON bodies (Meta expects
`application/x-www-form-urlencoded` or multipart, not raw JSON).
- **Create campaign:** `POST /act_<ID>/campaigns` with fields: `name`, `objective`, `status`
  (`ACTIVE`/`PAUSED`), `buy_type` (`AUCTION`), `special_ad_categories` (as required), and for Advantage+
  `is_advantage_plus_campaign`. Newer campaign stages also need `status` on creation. The response returns
  the campaign `id`.
- **Create ad set:** `POST /act_<ID>/adsets` with required fields: `name`, `campaign_id`,
  `targeting` (JSON targeting spec), and one bid/budget combination:
  `daily_budget` (or `lifetime_budget`) + either `bid_strategy` (`LOWEST_COST_WITHOUT_CAP`, etc.) or
  `bid_amount` (manual, in minor units), plus `optimization_goal` and `billing_event`.
  Also required for many objectives: `start_time`/`end_time`.
- **Create ad:** `POST /act_<ID>/ads` with `name`, `adset_id`, `creative`
  (`{"object_story_spec":{"page_id":"...","link_data":{...}}}` or `{...}` object story), and `status`.
- **Pause/resume:** `POST /act_<ID>/campaigns` (or per adset/ad) with `status=PAUSED` / `status=ACTIVE`.
- **Change budget:** `POST /act_<ID>/adsets?daily_budget=<int>` (or `lifetime_budget`), or update
  `campaign.daily_budget` on newer API versions.
- **Prerequisite hierarchy:** ad sets **must** belong to an existing campaign (`campaign_id`),
  ads **must** belong to an existing ad set (`adset_id`).

### Required fields summary (confirmed)
- **Campaign:** `name`, `objective`, `status`, `buy_type` (="AUCTION"), plus `special_ad_categories` when applicable.
- **Ad set:** `name`, `campaign_id`, `targeting`, `daily_budget` or `lifetime_budget`, `bid_strategy` or `bid_amount`, `optimization_goal`, `billing_event`, `start_time`/`end_time`.
- **Ad:** `name`, `adset_id`, `creative`, `status`.

### Basic ad without an image (object story)
- A "basic ad" via `object_story_spec` generally **requires** a creative asset (image/video) on Facebook —
  a link ad needs at least one image or a video in `link_data`/`video_data`.
- **However**, you can create an ad with **no image** if you use a templated/title-format such that only
  **text + link only** is disallowed for most placements; the supported image-less path is using the ad
  **`creative` with `object_story_spec` that references only a link and text is NOT valid** — Meta requires an image or video for link ads.
- The reliable image-less option is an **Instant Experience / Collection** or using a **video**, which still counts as media.
- **Practical answer:** standard link/photo ads require an image or video. If you truly have no image, you cannot create a valid link ad via object_story_spec; upload a media asset first.
- (An ad can be created and held in `PAUSED` state even if its creative is pending/under review, but the creative must still be structurally complete with media.)

### Money units (confirmed)
- `spend_cap` (ad-account), `daily_budget`, `lifetime_budget`, `bid_amount` are all in the **minor unit of the
  account currency** — i.e. **cents for USD**. Example: a $50/day budget = `daily_budget=5000`.
  The AdAccount doc explicitly states `spend_cap` "Value specified in basic unit of the currency, for example 'cents' for USD."

### Rate limits / errors (confirmed from AdAccount reference)
- `613` — calls exceeded rate limit.
- `80004` — too many calls to this ad account (see rate-limiting guide).
- `2635` — calling a deprecated API version; update to latest.
- `100` — invalid parameter; `190` — invalid OAuth token.
- Asset limits (regular account): 6,000 campaigns, 6,000 ad sets, 6,000 non-archived ads; archived 100k each.

---

## 3. Google Analytics 4 (GA4) Data API — v1beta

### Endpoint
```
POST https://analyticsdata.googleapis.com/v1beta/properties/PROPERTY_ID:runReport
```
- Host: `analyticsdata.googleapis.com` (not `googleapis.com/.../analyticsdata`).
- `PROPERTY_ID` is the numeric GA4 property id (e.g. `123456789`).

### Auth
- OAuth scope: **`https://www.googleapis.com/auth/analytics.readonly`** (read-only reporting).
- Send as `Authorization: Bearer <access_token>`. Can also use a service account whose email is granted
  Viewer access on the property.

### Get the property ID
- **Admin API** `accountSummaries.list`:
  `GET https://analyticsadmin.googleapis.com/v1beta/accountSummaries`
  (`Authorization: Bearer ...`) → returns account summaries containing `propertySummaries[].property`
  (as `properties/123456789`) and `displayName`. That is the canonical way to enumerate property IDs
  the account can access.
- The same property id appears in your GA4 admin URL (`analytics.google.com/.../<PROPERTY_ID>/...`).

### runReport body (confirmed)
```json
{
  "dateRanges": [{ "startDate": "2025-01-01", "endDate": "2025-01-31" }],
  "dimensions": [{ "name": "sessionDefaultChannelGroup" }],
  "metrics":    [{ "name": "sessions" }],
  "dimensionFilter": {
    "filter": {
      "fieldName": "sessionDefaultChannelGroup",
      "stringFilter": { "matchType": "EXACT", "value": "Paid Search" }
    }
  }
}
```
- Dimension/metric names are bare strings: `sessions`, `activeUsers`, `screenPageViews`,
  `sessionDefaultChannelGroup`, `country`, `date`, etc. (no `ga:` prefix, no `metrics[...]` object beyond `{name}`).
- `dimensionFilter` supports `{andGroup | orGroup | notExpression | filter}`; the `filter` object takes
  `fieldName` + `{stringFilter | numericFilter | inListFilter | betweenFilter | ...}`.
- `orderBys` to sort, `limit` for row cap (max 100,000 for regular reports), and `offset` or
  `nextPageToken` for pagination.

### Row limit & pagination
- **Confirmed-corrected:** the standard `runReport` now returns up to **100,000 rows** per response
  (raised from the original 10,000 in early 2024). This **supersedes the "10,000 row limit"** you mentioned.
- **Realtime `runRealtimeReport`** caps at **10,000 rows** (max 10,000 for realtime).
- Pagination: response contains `rowCount` (total) and `nextPageToken`; pass `nextPageToken` +
  `limit` on subsequent calls. Response shape: `{ "dimensionHeaders":[...], "metricHeaders":[...],
  "rows":[{"dimensionValues":[...],"metricValues":[...]}], "rowCount": N, "metadata": {...} }`.
- Dates should be within the property's data-retention window; the API supports relative `today`,
  `yesterday`, `7daysAgo`, `NdaysAgo`, `30daysAgo`, etc. in `startDate`/`endDate`.

### Realtime endpoint
```
POST https://analyticsdata.googleapis.com/v1beta/properties/PROPERTY_ID:runRealtimeReport
```
Body is the same kind of request (dateRanges are ignored for realtime):
```json
{
  "dimensions": [{ "name": "unifiedScreenName" }],
  "metrics": [{ "name": "activeUsers" }]
}
```
Returns data for roughly the last 30 minutes. Max 10,000 rows; realtime uses only a subset of dimensions/metrics.

### Example request body (runReport, full)
```json
POST https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport
{
  "dateRanges": [{ "startDate": "2025-01-01", "endDate": "2025-01-31" }],
  "dimensions": [{ "name": "sessionDefaultChannelGroup" }, { "name": "date" }],
  "metrics":    [{ "name": "sessions" }, { "name": "activeUsers" }],
  "limit": 100000
}
```

---

## 4. Cross-platform facts

### Rate limits (overview)
- **Google Ads `search`/`searchStream`:** measured in Query Units / "cost per request"; queries that select
  only attributes cost fewer QUs than those selecting metrics (metrics cost much more). QUs refill over a
  per-hour window. Use `searchStream` for bulk, add retry/backoff for `RESOURCE_EXHAUSTED` /
  `QuotaError.RESOURCE_EXHAUSTED` (rate exceeded). The default search page is 10,000 rows.
- **Google Ads mutate:** most services allow thousands of operations per request; six-month & per-time
  mutate limits apply by development access tier. Use `partialFailure` + `validateOnly` during development.
- **Meta Graph / Marketing API:** app-level and per-object rate limiting; per-user-per-app caps and
  per-ad-account caps. Respect `X-App-Usage` / `X-Ad-Account-Usage` response headers and back off on
  error `613` / `80004`. Insights limited to ~37 months.
- **GA4 Data API:** standard quota e.g. ~165 tokens/min, ~3 tokens/sec burst, ~50 tokens/project-per-1000-sec
  free-tier (check `analyticsdata.googleapis.com` quota doc for exact 2025 numbers — treat these as
  order-of-magnitude and monitor `quota` fields in the response). runReport max 100,000 rows/response,
  realtime 10,000.

### Node 24 capabilities — **VERIFIED on this machine (Node v24.15.0)**
- Global `fetch`: **yes** (`typeof globalThis.fetch === 'function'`)
- Global `crypto`: **yes** (`globalThis.crypto` exists, with `crypto.subtle` available)
- → PKCE (proof-key-for-code-exchange) with `crypto.randomUUID()` + `crypto.subtle.digest('SHA-256', ...)`
  + `btoa`/`URLSearchParams` is fully implementable with no dependencies on Node 24.

---

## Concrete JSON example bodies

### (a) Google Ads search query
```json
POST https://googleads.googleapis.com/v25/customers/1234567890/googleAds:search
Headers: { "Content-Type":"application/json", "Authorization":"Bearer <AT>", "developer-token":"<DT>" }
Body:
{
  "query": "SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion, metrics.search_impression_share FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31' ORDER BY segments.date",
  "pageSize": 1000
}
```

### (b) Google Ads mutate — add negative keywords (campaign-level)
```json
POST https://googleads.googleapis.com/v25/customers/1234567890/campaignNegativeKeywords:mutate
Headers: { "Content-Type":"application/json", "Authorization":"Bearer <AT>", "developer-token":"<DT>" }
Body:
{
  "partialFailure": true,
  "operations": [
    { "create": { "campaign": "customers/1234567890/campaigns/111",
                  "keyword": { "text": "free stuff", "matchType": "PHRASE" } } }
  ]
}
```
(equivalent ad-group-level: `adGroupNegativeKeywords:mutate` with `adGroup` instead of `campaign`)

### (c) Meta create campaign
```bash
# Meta expects form-encoded (curl -F), NOT raw JSON
curl -X POST "https://graph.facebook.com/v26.0/act_7654321/campaigns" \
  -F "name=Spring-Sale" \
  -F "objective=OUTCOME_TRAFFIC" \
  -F "status=PAUSED" \
  -F "buy_type=AUCTION" \
  -F "access_token=<TOKEN>"
# then create the ad set under it:
curl -X POST "https://graph.facebook.com/v26.0/act_7654321/adsets" \
  -F "name=SS-Adset" \
  -F "campaign_id=<CAMPAIGN_ID>" \
  -F "daily_budget=5000" \
  -F "bid_strategy=LOWEST_COST_WITHOUT_CAP" \
  -F "optimization_goal=REACH" \
  -F "billing_event=IMPRESSIONS" \
  -F 'targeting={"geo_locations":{"countries":["US"]}}' \
  -F "status=PAUSED" \
  -F "access_token=<TOKEN>"
# then the ad under the ad set (needs a media asset in the creative):
curl -X POST "https://graph.facebook.com/v26.0/act_7654321/ads" \
  -F "name=SS-Ad" \
  -F "adset_id=<ADSET_ID>" \
  -F 'creative={"object_story_spec":{"page_id":"<PAGE_ID>","link_data":{"link":"https://example.com","message":"Spring Sale","image_hash":"<IMAGE_HASH>"}}}' \
  -F "status=PAUSED" \
  -F "access_token=<TOKEN>"
```

### (d) GA4 runReport request
```json
POST https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport
Headers: { "Content-Type":"application/json", "Authorization":"Bearer <AT>" }
Body:
{
  "dateRanges": [{ "startDate": "2025-01-01", "endDate": "2025-01-31" }],
  "dimensions": [{ "name": "sessionDefaultChannelGroup" }, { "name": "date" }],
  "metrics":    [{ "name": "sessions" }, { "name": "activeUsers" }, { "name": "totalRevenue" }],
  "dimensionFilter": {
    "filter": { "fieldName": "sessionDefaultChannelGroup",
                "stringFilter": { "matchType": "EXACT", "value": "Paid Search" } }
  },
  "limit": 100000
}
```

---

## Key corrections to assumptions in the task
1. **Google Ads version is v25**, not v19/v20/v21.
2. There is **no `@kyxj`-style prefix token header**. The Google Ads required headers are
   `Authorization: Bearer`, `developer-token`, plus conditional `login-customer-id` / `linked-customer-id`.
3. GA4 `runReport` limit is **100,000 rows** (not 10,000). 10,000 applies to `runRealtimeReport`.
4. Meta `spend_cap`/budgets are in **minor currency units** (cents for USD) — confirmed.
5. A Meta **basic link ad requires an image/video**; an image-less object story is not valid for link ads.

## Primary official doc URLs
- Google Ads REST overview: https://developers.google.com/google-ads/api/rest/overview
- Google Ads auth & HTTP headers: https://developers.google.com/google-ads/api/rest/auth
- Google Ads Search/SearchStream: https://developers.google.com/google-ads/api/rest/common/search
- Google Ads Mutate: https://developers.google.com/google-ads/api/rest/common/mutate
- Google Ads versioning/upgrade & v25 fields: https://developers.google.com/google-ads/api/docs/upgrade
  and https://developers.google.com/google-ads/api/fields/v25/overview
- Developer token policy: https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- GA4 "Create a report": https://developers.google.com/analytics/devguides/reporting/data/v1/basics
- GA4 runReport reference: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- GA4 limits/quota: https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- GA4 Admin accountSummaries.list (property id): https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list
- Meta Marketing API overview: https://developers.facebook.com/docs/marketing-apis/overview
- Meta AdAccount reference (fields, budgets, errors): https://developers.facebook.com/docs/graph-api/reference/adaccount/