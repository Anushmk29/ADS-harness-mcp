# Meta Ads MCP parity plan

> **Status 2026-10-11:** steps 2–4 are built and tested offline.
> - All 91 tools are registered as `meta_mcp_*` and visible through `marketing-mcp`.
> - 10 new tests pass, and the type check is clean.
> - **Waiting on step 0** (your Meta token with the extra scopes) and **step 1** (the live snapshot run, which needs approval).
> - Until step 1, the snapshot is built from Meta's docs. Argument schemas are permissive, and every write is refused because `accountParam` is still unset.
>
> | Planned in section 3 | Built as |
> |---|---|
> | `tools.snapshot.json` | `src/modules/ads/meta-mcp/snapshot.ts`, so the build needs no JSON loader |
> | Meta's schema passed through as-is | Passed through nested under `arguments`, so the existing `accountId`/`operationId` gates work unchanged |
> | (not in section 3) | `meta_mcp_` added to the ads department prefixes in `src/departments/catalog.ts`. Without it, `marketing-mcp` hid the tools |

Goal: the harness can do **every one of the 91 tools** on Meta's official Ads MCP server (`https://mcp.facebook.com/ads`, open beta since 2026-04-29) without Claude Code or any other chat app, using the harness's own Meta token and its own safety gates.

Source lists (fetched 2026-10-11):
- [Comprehensive reporting](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-comprehensive-reporting)
- [Ad creation and management](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-ad-creation-and-management)
- [Catalog creation and management](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-catalog-creation-and-management)
- [Signals and datasets](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-signals-and-datasets)
- [Help and troubleshooting](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-help-and-troubleshooting)
- [A/B tests and conversion lift studies](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-abtests-and-conversion-lift-studies)
- [Activity logs](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-activity-logs)
- [Get started](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-get-started)

Meta's docs list tool names and one-line descriptions only. **No parameters are published.** The exact parameter schemas are only available live, from the server's `tools/list` call. Step 1 captures them.

---

## 1. The approach: connect to Meta's server, don't rewrite it

**Key fact from Meta's Get Started page.** A program can call the server directly: it sends JSON-RPC with an `Authorization: Bearer <user access token>` header. There is no OAuth click-through. So the harness can be an MCP *client* of Meta's server, unattended, with the token it already has.

**Why connect instead of rebuilding each tool on the plain Graph API:**
1. **Some tools only exist on Meta's server.** Examples: `ads_get_opportunity_score`, `ads_insights_advertiser_context`, `ads_insights_anomaly_signal`, `ads_insights_auction_ranking_benchmarks`, `ads_insights_industry_benchmark` and `ads_get_help_article`. Meta computes these internally, and there is no documented plain Graph API endpoint for them. Rebuilding cannot copy "everything". Connecting can.
2. **It copies exactly.** Tool names, descriptions and parameter schemas come straight from Meta. New tools Meta adds show up through a drift check (step 1); we don't have to write code for each one.
3. **It's small.** One client file plus one mapping file, instead of about 60 hand-written tools.

**What stays native (plain Graph API, as today):**
- The gated launch path: `ads_launch_meta`, `ads_continue_meta_launch`, the `meta_ads_*` CRUD tools and conversion-event sending.
- These already work and are tested. They are also the fallback if Meta's beta server changes or goes down.

**Risk accepted:** the server is a beta. Tools can be renamed or changed. Mitigations: the snapshot plus drift test (step 1), the off-by-default flag (step 2), and the native fallback above.

---

## 2. Gap table: all 91 tools

Legend:
- ✅ the harness already does this natively
- ⚠ partly
- ❌ not at all
- 🚫 deliberately blocked

**Plan** says what this plan does with each tool:
- **proxy** means exposed through the new Meta MCP client as `meta_mcp_<tool>`.
- **proxy-gated** means proxy, but every call goes through the harness's write gates (section 4).

### 2.1 Comprehensive reporting (7)

| # | Meta tool | R/W | Harness today | Plan |
|---|---|---|---|---|
| 1 | `ads_get_ad_entities` | R | ⚠ `meta_ads_insights` + `meta_ads_list_campaign/adset/ad` (no single filtered/sorted query) | proxy |
| 2 | `ads_get_opportunity_score` | R | ❌ | proxy |
| 3 | `ads_insights_advertiser_context` | R | ❌ | proxy |
| 4 | `ads_insights_anomaly_signal` | R | ⚠ our own fatigue heuristics (`meta_ads_get_performance_and_fatigue`, `ads_analyze_creative`) | proxy (keep ours too) |
| 5 | `ads_insights_auction_ranking_benchmarks` | R | ❌ | proxy |
| 6 | `ads_insights_industry_benchmark` | R | ❌ | proxy |
| 7 | `ads_insights_performance_trend` | R | ⚠ `meta_ads_insights` with `timeIncrement` (raw rows, no trend) | proxy |

### 2.2 Ad creation and management (27, plus `ads_get_ad_entities` already counted above)

| # | Meta tool | R/W | Harness today | Plan |
|---|---|---|---|---|
| 8 | `ads_get_ad_accounts` | R | ✅ `meta_ads_list_accounts` | proxy |
| 9 | `ads_get_ad_account_pages` | R | ❌ | proxy |
| 10 | `ads_get_pages_for_business` | R | ✅ `meta_ads_list_pages` | proxy |
| 11 | `ads_get_user_pages` | R | ❌ | proxy |
| 12 | `ads_get_field_context` | R | ❌ | proxy |
| 13 | `ads_create_campaign` | W | ✅ `meta_ads_create_campaign`, `ads_launch_meta` | proxy-gated |
| 14 | `ads_create_ad_set` | W | ✅ `meta_ads_create_adset` | proxy-gated |
| 15 | `ads_create_ad` | W | ✅ `meta_ads_create_ad` | proxy-gated |
| 16 | `ads_update_entity` | W | ✅ `meta_ads_update_campaign/adset/ad` | proxy-gated |
| 17 | `ads_activate_entity` | W | 🚫 activation is manual by policy ([service.ts:82](../../src/modules/ads/service.ts#L82)) | **blocked**: listed, returns "activate in Ads Manager" |
| 18 | `ads_create_creative` | W | ✅ `meta_ads_create_creative` | proxy-gated |
| 19 | `ads_get_creatives` | R | ✅ `meta_ads_list_creative` | proxy |
| 20 | `ads_get_creative_ads` | R | ❌ | proxy |
| 21 | `ads_get_ad_images` | R | ❌ (upload only: `meta_ads_upload_image`) | proxy |
| 22 | `ads_get_ad_videos` | R | ❌ (upload only: `meta_ads_upload_video`) | proxy |
| 23 | `ads_get_ad_preview` | R | ❌ | proxy |
| 24 | `ads_library_search` | R | ⚠ `research_competitor_ad_library` (scrapes by competitor domain) | proxy (keep ours too) |
| 25 | `ads_get_ig_accounts` | R | ⚠ `meta_ads_list_instagram_accounts` (Page-scoped, not ad-account-scoped) | proxy |
| 26 | `ads_get_ig_media` | R | ❌ | proxy |
| 27 | `ads_boost_ig_post` | W | ❌ | proxy-gated |
| 28 | `ads_get_ad_account_custom_audiences` | R | ✅ `meta_ads_list_audience` | proxy |
| 29 | `ads_get_custom_audience` | R | ✅ `meta_ads_get_audience` | proxy |
| 30 | `ads_get_custom_audience_adsets` | R | ❌ | proxy |
| 31 | `ads_create_custom_audience` | W | ✅ `meta_ads_create_audience` | proxy-gated + PII check |
| 32 | `ads_update_custom_audience` | W | ✅ `meta_ads_update_audience` | proxy-gated |
| 33 | `ads_update_custom_audience_users` | W | ⚠ `meta_ads_audience_add_users` (add only, no remove) | proxy-gated + PII check |
| 34 | `ads_delete_custom_audience` | W | ✅ `meta_ads_delete_audience` | proxy-gated |

### 2.3 Catalog creation and management (34)

| # | Meta tool | R/W | Harness today | Plan |
|---|---|---|---|---|
| 35 | `ads_catalog_create` | W | ✅ `meta_ads_create_catalog` (no initial products) | proxy-gated |
| 36 | `ads_catalog_update_catalog` | W | ✅ `meta_ads_update_catalog` | proxy-gated |
| 37 | `ads_catalog_get_catalogs` | R | ✅ `meta_ads_list_catalog` | proxy |
| 38 | `ads_catalog_get_details` | R | ✅ `meta_ads_get_catalog` | proxy |
| 39 | `ads_catalog_get_diagnostics` | R | ❌ | proxy |
| 40 | `ads_catalog_get_dynamic_ads_health` | R | ❌ | proxy |
| 41 | `ads_catalog_get_data_sources` | R | ❌ | proxy |
| 42 | `ads_catalog_get_product_details` | R | ⚠ `meta_ads_list_products` (no single-product get) | proxy |
| 43 | `ads_catalog_product_create` | W | ❌ | proxy-gated |
| 44 | `ads_catalog_update_product` | W | ❌ | proxy-gated |
| 45 | `ads_catalog_delete_product` | W | ❌ | proxy-gated |
| 46 | `ads_catalog_get_product_product_sets` | R | ❌ | proxy |
| 47 | `ads_catalog_search_product` | R | ⚠ `meta_ads_list_products` with a filter param | proxy |
| 48 | `ads_catalog_create_product_set` | W | ✅ `meta_ads_create_product_set` | proxy-gated |
| 49 | `ads_catalog_update_product_set` | W | ✅ `meta_ads_update_product_set` | proxy-gated |
| 50 | `ads_catalog_get_product_sets` | R | ✅ `meta_ads_list_product_set` | proxy |
| 51 | `ads_catalog_get_product_set_details` | R | ✅ `meta_ads_get_product_set` | proxy |
| 52 | `ads_catalog_get_product_set_products` | R | ❌ | proxy |
| 53 | `ads_catalog_product_set_delete` | W | ✅ `meta_ads_delete_product_set` | proxy-gated |
| 54 | `ads_catalog_create_product_feed` | W | ✅ `meta_ads_create_product_feed` | proxy-gated |
| 55 | `ads_catalog_update_product_feed` | W | ✅ `meta_ads_update_product_feed` | proxy-gated |
| 56 | `ads_catalog_get_product_feed_details` | R | ✅ `meta_ads_get_product_feed` | proxy |
| 57 | `ads_catalog_create_product_feed_upload_session` | W | ⚠ `meta_ads_upload_feed` (URL upload, no chunked session) | proxy-gated |
| 58 | `ads_catalog_get_product_feed_upload_sessions` | R | ✅ `meta_ads_list_feed_uploads` | proxy |
| 59 | `ads_catalog_product_feed_delete` | W | ✅ `meta_ads_delete_product_feed` | proxy-gated |
| 60 | `ads_catalog_create_feed_rule` | W | ❌ | proxy-gated |
| 61 | `ads_catalog_get_feed_rules` | R | ❌ | proxy |
| 62 | `ads_catalog_product_feed_delete_rule` | W | ❌ | proxy-gated |
| 63 | `ads_catalog_event_source_get` | R | ❌ | proxy |
| 64 | `ads_catalog_event_source_get_catalogs` | R | ❌ | proxy |
| 65 | `ads_catalog_event_source_get_health` | R | ❌ | proxy |
| 66 | `ads_catalog_event_source_get_recommendations` | R | ❌ | proxy |
| 67 | `ads_catalog_event_source_connect` | W | ❌ | proxy-gated |
| 68 | `ads_catalog_event_source_disconnect` | W | ❌ | proxy-gated |

### 2.4 Signals and datasets (13)

| # | Meta tool | R/W | Harness today | Plan |
|---|---|---|---|---|
| 69 | `ads_get_datasets` | R | ✅ `meta_ads_list_pixels` | proxy |
| 70 | `ads_get_dataset_details` | R | ❌ | proxy |
| 71 | `ads_get_dataset_stats` | R | ❌ (28-day window max, per Meta) | proxy |
| 72 | `ads_get_dataset_quality` | R | ❌ (EMQ, match-key coverage, freshness) | proxy |
| 73 | `ads_pixel_event_read` | R | ❌ | proxy |
| 74 | `ads_pixel_event_create` | W | ❌ (Meta: new rules start inactive) | proxy-gated |
| 75 | `ads_pixel_event_update` | W | ❌ (this is how a rule gets activated) | proxy-gated |
| 76 | `ads_pixel_event_delete` | W | ❌ | proxy-gated |
| 77 | `ads_pixel_parameter_read` | R | ❌ | proxy |
| 78 | `ads_pixel_parameter_create` | W | ❌ | proxy-gated |
| 79 | `ads_pixel_parameter_update` | W | ❌ | proxy-gated |
| 80 | `ads_pixel_parameter_delete` | W | ❌ | proxy-gated |
| 81 | `ads_get_customconversions` | R | ❌ | proxy |

### 2.5 Help and troubleshooting (2)

| # | Meta tool | R/W | Harness today | Plan |
|---|---|---|---|---|
| 82 | `ads_get_errors` | R | ❌ (`meta_ads_readiness` only checks details passed in to it, not live) | proxy |
| 83 | `ads_get_help_article` | R | ❌ | proxy |

### 2.6 A/B tests and conversion lift studies (7)

| # | Meta tool | R/W | Harness today | Plan |
|---|---|---|---|---|
| 84 | `ads_experiment_list_tests` | R | ❌ | proxy |
| 85 | `ads_experiment_check_eligibility` | R | ❌ | proxy |
| 86 | `ads_experiment_abtest_create_test` | W | ❌ | proxy-gated |
| 87 | `ads_experiment_abtest_get_test` | R | ❌ | proxy |
| 88 | `ads_experiment_abtest_update_test` | W | ❌ (includes cancel) | proxy-gated |
| 89 | `ads_experiment_lift_create_test` | W | ❌ | proxy-gated |
| 90 | `ads_experiment_lift_get_test` | R | ❌ | proxy |

### 2.7 Activity logs (1)

| # | Meta tool | R/W | Harness today | Plan |
|---|---|---|---|---|
| 91 | `ads_account_get_activity_logs` | R | ⚠ `ads_list_operations` shows only the harness's own actions | proxy |

### 2.8 Totals

|  | Count |
|---|---|
| Meta tools | **91** (55 read, 36 write) |
| ✅ Harness already has it | 28 |
| ⚠ Partial | 10 |
| ❌ Missing | 52 |
| 🚫 Blocked by design | 1 (`ads_activate_entity`) |
| **After this plan** | 90 callable plus 1 blocked with a clear message. Nothing left out |

**Correction to what I said earlier in chat:** I said catalogs were ❌. That was wrong. The harness already has catalog, product-set and product-feed CRUD in [tools.ts](../../src/modules/ads/tools.ts) (the `metaResources` loop).

**The harness has things Meta's server doesn't**, and these stay:
- Google Ads, GA4 and Search Console
- Conversions API event sending (`meta_ads_send_conversion_events`)
- Lead forms
- Page posts
- Budget schedules
- Approval with an exact payload hash
- Per-write budget ceilings
- Account allowlist
- Measurement reconciliation
- The creative module

---

## 3. Files

| File | What |
|---|---|
| `src/modules/ads/meta-mcp/client.ts` (new) | Uses the **already-installed** `@modelcontextprotocol/sdk` (`Client` + `StreamableHTTPClientTransport`), so no new dependency. Connects to `ADS_META_MCP_URL` (default `https://mcp.facebook.com/ads`) with `Authorization: Bearer` set to the same `ADS_DIRECT_META_ACCESS_TOKEN` that [transport.ts:19](../../src/modules/ads/transport.ts#L19) reads. Exposes `listTools()` and `callTool(name, args)`. Lazy connect, 60 s timeout. Reads retry on 429 and 5xx. **Writes never auto-retry**: a timeout marks the operation `UNCERTAIN`, the same as the native launch path does |
| `src/modules/ads/meta-mcp/tools.snapshot.json` (new, generated) | The verbatim `tools/list` output: every name, description and `inputSchema` |
| `src/modules/ads/meta-mcp/mapping.ts` (new) | One entry per Meta tool: `{ write: boolean, accountParam?: string, pii?: true, blocked?: string, native?: 'meta_ads_…' }`. This is the single place that classifies each tool |
| `src/modules/ads/tools.ts` (edit) | Reads snapshot + mapping and registers each tool as an `AdsTool` named `meta_mcp_<name>`, with `action: 'meta_mcp'`, `platform: 'meta'` and the `write` flag from the mapping. Add an optional `jsonSchema` field to `AdsTool` so Meta's schema is passed through unchanged |
| `src/modules/ads/service.ts` (edit) | In `listTools()` ([service.ts:46](../../src/modules/ads/service.ts#L46)), use `tool.jsonSchema` when it is set instead of `zodToJsonSchema`. All other gates stay as they are |
| `src/modules/ads/transport.ts` (edit) | In `dispatch()`, `action === 'meta_mcp'` calls `client.callTool(name without the prefix, args)` |
| `bin/meta-mcp-snapshot.js` (new) | `node --env-file=.env bin/meta-mcp-snapshot.js` refreshes the snapshot and prints a diff: added, removed and changed-schema tools |
| `tests/ads/meta-mcp.test.ts` (new) | Section 5 |
| `.env.example` (edit) | `ADS_META_MCP=off`, `ADS_META_MCP_URL=https://mcp.facebook.com/ads` |
| `docs/guides/departments-quickstart.md` (edit) | Short section: enabling it, scopes, what stays blocked |

Why the `meta_mcp_` prefix: it keeps Meta's names visible but avoids collisions with the harness's own `ads_*` tools (e.g. `ads_list_operations`).

---

## 4. Safety gates for the 36 write tools

Every `proxy-gated` call goes through the same path as native writes in [service.ts](../../src/modules/ads/service.ts). Nothing new is trusted:

1. **Mode.** `off` / `dry-run` / `live-with-approval` apply unchanged. The default is `dry-run`, which records the call but sends nothing.
2. **Approval.** Each write needs a stable `operationId` and an approval bound to the exact payload hash, same as `ads_launch_meta`.
3. **Account allowlist.** The mapping's `accountParam` names which argument holds the ad account id, and that id must be in the allowlist ([service.ts:75](../../src/modules/ads/service.ts#L75)). **A write tool with no `accountParam` in the mapping is refused.** That is fail-safe for tools we haven't classified yet.
4. **No activation.**
   - `ads_activate_entity` is blocked outright.
   - The existing `"status":"ACTIVE"` check ([service.ts:82](../../src/modules/ads/service.ts#L82)) also catches `ads_update_entity`, `ads_boost_ig_post` and `ads_experiment_*_create_test` if they try to go live.
   - `ads_pixel_event_update` can activate a pixel rule. That doesn't spend money, so it is allowed with approval.
5. **Money ceiling.** The existing per-write budget and bid cap ([service.ts:94](../../src/modules/ads/service.ts#L94)) applies. **Check during the build** that it catches the budget field names Meta's schemas use (`daily_budget`, `lifetime_budget`, `bid_amount`, and anything new in the snapshot). If not, add those names.
6. **PII.** `ads_create_custom_audience` (customer file) and `ads_update_custom_audience_users` must contain only SHA-256 hex values for email and phone. Refuse anything that looks like a raw email or phone number. The harness never uploads plain personal data.
7. **Untrusted output.** Meta's tool results, especially `ads_library_search`, help articles and IG captions, are treated as data. They are never followed as instructions. This is Meta's own warning about prompt injection.
8. **Unknown tools.** A tool that appears in a new snapshot but not in the mapping is **not registered** until someone classifies it. The drift test fails until then.

---

## 5. Tests (offline, fake MCP server, no network)

1. **Completeness.**
   - Every tool in `tools.snapshot.json` has a mapping entry, and every mapping entry exists in the snapshot.
   - The snapshot holds exactly the 91 names in section 2, until a refresh changes that on purpose.
   - This is the guarantee that nothing is left out.
2. **Registration.** All 91 appear in `listTools()` as `meta_mcp_*`, with Meta's `inputSchema` passed through unchanged.
3. **Read passthrough.** `meta_mcp_ads_get_ad_entities` calls `tools/call` with the same arguments and returns the result.
4. **Write gates.** Each of the following is refused before any network call:
   - a write in `dry-run` mode
   - a write without `operationId`
   - a write to an account not in the allowlist
   - a write whose mapping has no `accountParam`
   - a payload containing `"status":"ACTIVE"`
   - a budget over the ceiling
   - `ads_activate_entity`
   - a raw email in `ads_update_custom_audience_users`
5. **Approved write.** With matching approval it calls `tools/call` exactly once. A timeout gives `UNCERTAIN` and no retry.
6. **Feature flag.** With `ADS_META_MCP=off`, no `meta_mcp_*` tools are listed and nothing connects.
7. **MCP exposure.**
   - `bin/mcp.js ads meta` lists the `meta_mcp_*` tools.
   - `department_run` can call one.

---

## 6. Build order

| Step | What | Needs you? |
|---|---|---|
| 0 | **Token and app.** Meta's docs say a user token needs `ads_mcp_management`, `ads_read`, `ads_management`, `catalog_management`, `business_management`, `pages_show_list` and `instagram_basic`. If you use your own Meta app, add the use case "Create & manage ads with ads MCP server" to it. Generate a fresh token (the old one in `.env.example` must be revoked anyway) and put it in `.env` | **Yes, you** |
| 1 | Write `bin/meta-mcp-snapshot.js` and run it **once**. It is read-only (`tools/list`) and costs nothing, but it sends your token to Meta. Commit the snapshot. Check that the names match section 2 | **I ask before running it** |
| 2 | `client.ts` and `mapping.ts` for all 91, the `AdsTool.jsonSchema` field, the `listTools` change, the `dispatch` branch and the off-by-default flag. Tests 1, 2, 3 and 6 | No |
| 3 | Write gates: accountParam, PII check, activation block, budget field names. Tests 4 and 5 | No |
| 4 | Expose through `marketing-mcp` and `marketing-department` (test 7), then docs | No |
| 5 | **Live read check.** Call 5 read tools against your ad account: `ads_get_ad_accounts`, `ads_get_ad_entities`, `ads_get_errors`, `ads_get_dataset_quality` and `ads_account_get_activity_logs` | **I ask first** |
| 6 | **Live write check.** On a **test** ad account, run one `ads_create_campaign` (paused) in `dry-run`, then with approval. Read it back, then delete it | **I ask first, every Meta write** |

The creative module (paused-ad hand-off, step 7 of that plan) can then use either the native `meta_ads_upload_image` path or `meta_mcp_ads_create_creative`. It will keep the native path, because that path is tested and doesn't depend on the beta.

---

## 7. Deliberately not done

| Not done | Why | Add when |
|---|---|---|
| Rewriting the 52 missing tools on the plain Graph API | Several have no public endpoint, and connecting copies them exactly with far less code | Meta shuts the beta server down or makes it unreliable. The snapshot then gives the exact list to rebuild |
| Activating ads from the harness | Existing policy: activation is a human step in Ads Manager | You decide to allow it. That's a policy change, not a code gap |
| Meta's OAuth login flow | Unattended runs use the bearer token; OAuth needs a person clicking | The harness gets a web login for clients |
| Meta's Ads CLI (npm) | Same tools again, and calling the MCP server directly is simpler | Never, unless the MCP server is retired |
| Refreshing the snapshot on a schedule | Manual refresh plus the drift diff is enough for a beta | Meta starts changing tools often |
