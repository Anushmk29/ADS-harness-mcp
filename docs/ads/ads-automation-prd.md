# Sequential Ads Automation PRD: Meta → Google Ads → GA4

## Summary

Build and release the ads automation system in this order:

1. Complete and validate Meta Ads automation.
2. Build Google Ads automation on the proven Meta safety architecture.
3. Add GA4 measurement, attribution, tracking audits, and cross-platform reconciliation.

The Meta requirements in this PRD are based on `C:\Users\ABC\Downloads\Meta Ads Automation.docx`. The document is product input, not an executable specification: API-sensitive claims must be confirmed through versioned provider contracts and paused-object tests before they are marked supported.

Implementation began from a 65-of-65 passing baseline; the current suite is 87 of 87 passing. The previous claim that 17 of 60 tests fail is obsolete.

Supported v1 business families:

- E-commerce
- Lead generation and local services
- SaaS

Regulated Meta categories remain outside self-service activation. Image generation and automatic landing-page publishing are outside v1.

## Implementation status

The shared safety foundation, typed Meta launch path, Google validation/planning layer, GA4 reporting/auditing layer, durable monitoring jobs, reconciliation, and DeepSeek-facing HTTP/MCP contracts are implemented locally. Meta hierarchy launch uses one exact approval, paused creation, provider readback, and safe continuation from known partial state; uncertain creates remain blocked. Google campaign creation is deliberately gated behind a persisted successful Meta lifecycle and exact provider `validateOnly` receipt. The high-level Google hierarchy executor is not enabled until that authenticated Meta gate is achieved. Provider capabilities remain `UNVERIFIED` until their designated paused-object or property tests pass; synchronous low-level provider tools are contract/test primitives, not substitutes for high-level rollout verification.

## Shared Foundation

Complete these requirements before platform rollout.

### Execution modes and safety

- Standardize operating modes as `off`, `dry-run`, and `live-with-approval`.
- Migrate the current `review` mode to `live-with-approval`.
- Disable autonomous live writes in v1.
- Use the durable lifecycle:

  `DRAFT → PENDING_APPROVAL → AUTHORIZED → DISPATCHED → VERIFIED`

- Support `REJECTED`, `FAILED`, `PARTIAL`, and `UNCERTAIN`.
- Bind approval to the exact provider, account, operation ID, object, and payload hash.
- Editing a proposal creates a new approval payload.
- Reusing an operation ID with a different payload fails.
- Never retry an uncertain create automatically; reconcile provider state first.
- Create campaigns, ad sets/ad groups, and ads paused. Activation is a separate approved operation.

### Capability and version management

- Persist a `ProviderVersionManifest` per provider.
- Store API version, capability status, deprecated fields, prohibited placements, attribution rules, evidence, verification date, and next review date.
- Give every capability one status: `SUPPORTED`, `MANUAL`, `UNVERIFIED`, `DEPRECATED`, or `UNSUPPORTED`.
- Treat provider acceptance, remote verification, policy approval, and delivery as separate outcomes.

### Security, persistence, and operations

- Encrypt stored credentials using AES-GCM and a deployment secret.
- Give every client a separate deployment, database, encryption key, provider credentials, and storage volume.
- Redact credentials and customer identifiers from logs and model context.
- Persist connections, sync cursors, operations, approvals, jobs, reports, schedules, metrics, recommendations, manual handoffs, and imported outcomes in SQLite.
- Use durable workers with leases, idempotency, bounded retries, quota awareness, and manual-review/dead-letter states.
- Preserve pending work and approvals across restarts.

### Measurement invariants

Maintain three independent views:

1. Meta/Google platform-attributed results
2. GA4-attributed web and app results
3. Deduplicated CRM/order revenue

Never add Meta-attributed and Google-attributed revenue together and present it as business revenue.

Every report and recommendation includes its source, synchronization time, period, attribution basis, timezone, currency, data-quality warnings, conversion lag, and minimum-data status.

Reject currency mismatches unless an explicit FX source and date are supplied. A zero denominator produces an unavailable ratio, never a fabricated value.

## Phase M — Meta Ads Automation

### M1. Account readiness and manual boundaries

Create `MetaAccountReadiness` and `MetaAssetInventory` records containing:

- Ad account and Business Manager
- Facebook Page and Instagram identity
- Dataset/Pixel and conversion events
- WhatsApp connection
- App and app-event configuration
- Currency, timezone, payment, and business verification
- `ads_management` permission
- Marketing API Access Tier
- Token and asset-access health

Represent these as explicit `MetaManualHandoff` records:

- Business verification and payment method
- Pixel/dataset and Conversions API installation
- WhatsApp-to-Page connection
- App SDK and app-event configuration
- Ad review, rejection appeals, and policy remediation
- Creative-quality and scaling judgment
- Customer lifecycle strategy and Ads Manager-only settings

Each prerequisite is `READY`, `BLOCKED`, `MANUAL_STEP_REQUIRED`, or `UNVERIFIED`, with an owner, reason, required action, and verification time.

Track `ads_management` separately from Marketing API Access Tier. Meta currently uses Limited and Full tiers. Full-tier eligibility includes at least 500 Marketing API calls in 15 days and an error rate below 15 percent.

### M2. Typed objective compatibility model

Replace generic Meta records with:

- `MetaCampaignSpec`
- Objective-specific `MetaAdSetSpec`
- `MetaAdSpec`
- `MetaAssetInventory`
- `MetaCompatibilityRule`
- `MetaBudgetSchedule`
- `MetaManualHandoff`

Model the document's three provider layers.

#### Campaign layer

- All six `OUTCOME_*` objectives
- Campaign/ad-set budget ownership
- Daily or lifetime budget
- Budget and ad scheduling
- Bid strategy
- Special-ad category
- Paused status

#### Ad-set layer

- Conversion location and destination
- Performance goal
- Audience and detailed targeting
- Placements and exclusions
- Advantage+ inputs and predicted state
- Dataset/app/promoted-object dependency
- Frequency controls and billing event
- Start and end time

#### Ad layer

- Facebook Page and Instagram identity
- Existing post or uploaded image/video
- Destination URL or messaging destination
- Primary text, headline, description, and CTA
- URL parameters and tracking
- Paused status

Build a compatibility registry keyed by objective + conversion location + performance goal. Each rule records prerequisites, destinations, promoted object, dataset/app requirements, bid strategies, placements, API version, verification status, and evidence.

### M3. Meta-specific rules

- Require `special_ad_categories` on every campaign.
- Self-service v1 accepts only the provider's no-category representation; regulated values block dispatch.
- Support `LOWEST_COST_WITHOUT_CAP`, `COST_CAP`, `LOWEST_COST_WITH_BID_CAP`, and `LOWEST_COST_WITH_MIN_ROAS`.
- Permit minimum-ROAS only with `VALUE` optimization and a valid purchase-value source.
- Model budget schedules with amount, `ABSOLUTE` or `MULTIPLIER`, start/end time, and daily-budget eligibility.
- Persist every requested and returned budget schedule locally.
- Determine budget-schedule read/mutation support through pinned-version contract tests.
- Derive Advantage+ from campaign-budget placement, `advantage_audience`/location-only targeting, and placement exclusions.
- Read back `advantage_state_info`; do not expose retired Advantage+ switches.
- Warn that detailed targeting or placement exclusions can remove Advantage+ behavior.
- Exclude Instagram Explore feed, Messenger Stories, and new poll ads.
- Default to standard attribution and never request removed 7-day or 28-day view windows.
- Keep incremental attribution, Instagram Live promotion, placement value rules, and customer lifecycle strategy disabled until officially documented and live-verified.
- Treat the 27 October 2026 Meta removals as a release-blocking version check.
- Review the manifest for every Marketing API release and monitor the expected v27 cycle.

### M4. Rollout sequence

1. In the owned account, validate and create paused Awareness, Traffic, Engagement, and Leads hierarchies.
2. Test every supported objective/location/goal combination as paused objects.
3. Add Sales after dataset, purchase event, value, CAPI, and attribution readiness pass.
4. Add campaign/ad-set/ad insights, frequency monitoring, creative-fatigue analysis, and approval-based pause/scale proposals.
5. Complete client-account access and the pre-publish checklist.
6. Add App Promotion last after app, SDK, store, and app-event readiness.

During the pilot, publishing remains manual in Ads Manager. After a two-week shadow period and successful account-specific review, activation may occur through an exact-payload approval. No live Meta change is automatic in v1.

### M5. Acceptance gates

- All supported objects are created paused.
- Invalid objective/location/goal combinations fail before dispatch.
- Page, Instagram, WhatsApp, dataset, app, creative, and destination prerequisites fail closed.
- Special-ad-category and targeting restrictions fail closed.
- Advantage+ state is read from the provider and compared with the predicted state.
- Budget schedules remain traceable across restart.
- Ad review and delivery remain distinct from creation success.
- Partial and uncertain launches resume without recreating verified parents.

## Phase G — Google Ads Automation

Google creation begins only after the Meta paused lifecycle passes its acceptance gates.

### G1. Google account readiness

Create `GoogleAdsAccountReadiness` containing:

- OAuth or service-account access
- Developer token and access level
- Manager and client customer IDs
- `login-customer-id`
- Billing and account status
- Currency and timezone
- Auto-tagging and conversion actions
- Google Ads–GA4 link
- Merchant Center readiness where required
- Brand/policy restrictions and destination readiness
- Token, permission, and quota health

Track Test, Explorer, Basic, and Standard access explicitly. Pin the REST endpoint to Google Ads API v25 and track minor capabilities, including v25.2, in `ProviderVersionManifest`.

### G2. Measurement-first integration

Create typed GAQL report definitions for:

- Account, campaign, ad group, keyword, ad, and asset performance
- Search terms and negative-keyword opportunities
- Spend and budget pacing
- Conversion actions and values
- Bidding strategy and learning readiness
- Impression share and Quality Score
- Policy status, change history, and experiments

Rules:

- Treat `metrics.cost_micros` as micros.
- Do not treat conversion values as micros unless the field contract says so.
- Analyze every returned campaign.
- Preserve missing values as unavailable.
- Preserve search terms at campaign and ad-group scope.
- Respect the 37-month limit for granular daily/weekly reporting.
- Keep privacy omissions and provider thresholds visible.

### G3. Google Search campaign builder

Create `GoogleSearchCampaignSpec` with:

- Campaign budget and campaign
- Search networks, locations, and languages
- Dates and ad schedule
- Conversion goals and bidding strategy
- Ad groups
- Keywords and match types
- Campaign/ad-group negative keywords
- Responsive search ads and assets
- Final URLs, tracking template, final URL suffix, and custom parameters

Workflow:

1. Validate domain, copy, assets, conversions, budget, bidding, and policy prerequisites.
2. Submit with `validateOnly` before approval.
3. Create resources in dependency order using stable operation IDs.
4. Force campaign and ads to paused status.
5. Read back and verify configuration, policy, and delivery status.

Generated copy must enforce responsive-search-ad character limits, factual claims, destination validity, and prohibited-content rules.

### G4. Optimization and experiments

Generate evidence-backed proposals for:

- Search-term exclusions
- Keyword and match-type changes
- Budget pacing
- Bid-strategy changes
- Asset improvements
- Conversion setup defects
- Experiment creation, scheduling, evaluation, promotion, or termination

Each proposal includes evidence and comparison periods, conversion lag, minimum-data status, expected result, confidence, cooldown, evaluation date, and stop condition.

Keep suggestions separate from execution. Preserve operation-level partial failures.

### G5. Additional campaign types

Implement in this order:

1. Performance Max and Shopping
2. Demand Gen
3. Display
4. App campaigns
5. Reporting/manual handoffs for unsupported legacy Video behavior

Performance Max and Shopping require a Merchant Center link, feed diagnostics, conversion-value readiness, asset groups/assets, listing filters, and explicit asset-automation settings.

Legacy `VideoAd` remains reporting-only. Use Performance Max or Demand Gen for supported API-managed video workflows.

### G6. Acceptance gates

- Test-account reads and paused writes work with the developer token.
- Production access level and permissible use are recorded before production calls.
- GAQL fixtures cover pagination, segmentation, empty data, privacy omissions, and invalid fields.
- Search launches validate first and create paused resources in dependency order.
- Update masks, partial failures, long-running operations, and request IDs are preserved.
- Search-term proposals never execute without approval.
- Merchant Center and value prerequisites fail closed for PMax/Shopping.

## Phase A — GA4 Automation

GA4 cross-platform recommendations begin only after Meta and Google identifiers, UTMs, conversions, timezones, and currencies are aligned.

### A1. Property and tracking readiness

Create `GA4PropertyReadiness` containing:

- Selected account/property and access
- Property timezone and currency
- Web/app data streams
- Google tag and enhanced measurement
- Key events and revenue events
- Google Ads link
- Data retention and attribution settings
- Consent configuration
- Internal traffic, unwanted referrals, and cross-domain setup
- UTM, `gclid`, campaign-ID, and event-parameter availability

Separate the GA4 Data API, Admin API, and Measurement Protocol:

- Data API operations are read-only.
- Admin API changes require exact approval.
- Measurement Protocol sending is a distinct consent-sensitive capability.
- Alpha-only features are unstable and disabled by default.

### A2. Reliable reporting pipeline

- Import a 90-day baseline and then synchronize daily.
- Use metadata and `checkCompatibility` before dynamic reports.
- Support standard, pivot, realtime, and funnel reports.
- Paginate standard reports with a maximum requested page size of 250,000 rows.
- Request and store quota metadata where supported.
- Apply backoff separately for Core, Realtime, and Funnel quotas.

Create templates for landing pages, source/medium, channel group, campaigns, events, key events, ecommerce revenue, lead funnels, user versus traffic acquisition, device/geography, and realtime health.

### A3. Data-quality and tracking audits

Persist and surface:

- Sampling metadata
- Thresholding
- `(other)` row data loss
- Approximate unique-user counts
- Data freshness
- Schema restrictions
- Empty-result reasons
- Property timezone
- Quota status

Data-quality defects reduce recommendation confidence or produce `INSUFFICIENT_EVIDENCE`.

Audit duplicate conversions, missing UTMs, broken cross-domain sessions, missing revenue/currency, invalid parameters, primary/secondary conversion alignment, Google Ads imports, consent gaps, stale tracking, and landing-page/funnel drop-offs.

### A4. GA4 administration

Expose approval-bound proposals for:

- Key events
- Audiences
- Channel groups
- Data streams
- Enhanced measurement
- Data retention
- Reporting annotations
- Supported Google Ads, BigQuery, Firebase, DV360, and Search Ads 360 links

Do not promise arbitrary attribution-model changes. Unsupported or UI-only configuration becomes a manual handoff.

### A5. Cross-platform reconciliation

Match data using campaign IDs, UTMs, eligible click identifiers, external outcome IDs, timestamps, and currency.

CSV outcome imports use:

- `external_id`
- `occurred_at`
- `outcome_type`
- `value`
- `currency`
- `lead_status`
- Optional campaign/click identifiers

Reject malformed rows, duplicate outcomes, and currency mismatches. Keep platform attribution, GA4 attribution, and deduplicated business revenue separate in storage and presentation.

### A6. Acceptance gates

- Test OAuth refresh, revocation, wrong-property, and expired-token behavior.
- Compare reports with GA4 UI exports using identical dates, dimensions, metrics, filters, timezone, and attribution settings.
- Keep pagination, quotas, sampling, thresholding, `(other)`, and empty-result metadata visible.
- Distinguish missing access from missing data.
- Prevent Admin mutations from bypassing approval.
- Prevent cross-platform ROAS from using duplicated platform revenue.

## Public Interfaces

Add API groups:

- `/api/provider-versions`
- `/api/meta/readiness`
- `/api/meta/capabilities`
- `/api/meta/campaigns/validate`
- `/api/meta/launches`
- `/api/meta/launches/:id/verify`
- `/api/google-ads/readiness`
- `/api/google-ads/capabilities`
- `/api/google-ads/campaigns/validate`
- `/api/google-ads/launches`
- `/api/google-ads/reports`
- `/api/ga4/readiness`
- `/api/ga4/reports`
- `/api/ga4/audits`
- `/api/ga4/admin-proposals`
- `/api/measurement/reconciliation`

Core public and persisted types:

- `ProviderVersionManifest`
- `CapabilityStatus`
- `ManualHandoff`
- `MetaAccountReadiness`
- `MetaCampaignSpec`
- `MetaAdSetSpec`
- `MetaAdSpec`
- `GoogleAdsAccountReadiness`
- `GoogleCampaignSpec`
- `GoogleSearchCampaignSpec`
- `GA4PropertyReadiness`
- `GA4ReportSpec`
- `TrackingHealth`
- `DataQualityMetadata`
- `AttributionView`
- `CrossPlatformMetricSnapshot`

## Client Dashboard and Reporting

The beginner-first dashboard answers:

- What happened?
- Why does it matter?
- What needs attention?
- What does the assistant recommend?
- What changed after approval?
- Are connections and tracking healthy?

Default cadence:

- Daily: synchronization and urgent health alerts
- Weekly: performance, problems, recommendations, and approvals
- Monthly: strategy, allocation, experiments, creative learnings, and priorities

The dashboard is the canonical report. Scheduled emails link to authenticated report and approval pages.

## Complete Acceptance Plan

- Preserve the original 65-test baseline and the current 87-test implementation suite.
- Verify no provider write occurs in `off` or `dry-run`.
- Verify every created campaign object starts paused.
- Test approval, rejection, edited/reapproved payloads, partial failure, uncertain dispatch, restart, and duplicate prevention.
- Live-test Meta first in the owned account.
- Live-test Google next in a test account, then designated production accounts with paused objects only.
- Verify GA4 reports against matching UI exports.
- Test expired tokens, wrong accounts/properties, pagination, quotas, deprecated fields, permission loss, policy rejection, missing assets, conversion lag, and insufficient evidence.
- Run a minimum two-week dry-run/shadow period before the first approval-bound live activation.

## Assumptions and Defaults

- Meta is completed first, Google Ads second, and GA4 third.
- Initial Google creation supports Search; Performance Max/Shopping and Demand Gen follow.
- GA4 reporting is read-only; GA4 Admin mutations require approval.
- Existing datasets, properties, accounts, and Merchant Center links are selected rather than provisioned in v1.
- No live ad-account change is automatic in v1.
- Each workspace uses one timezone and reporting currency.
- Data retention defaults to 24 months.
- Unconfirmed Meta walkthrough observations become discovery tests, not production behavior.
- Google developer-token approval and Meta app review are external launch prerequisites.
