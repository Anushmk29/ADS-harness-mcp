import { z } from 'zod';
import { ga4ReportSpecSchema, metaCampaignSpecSchema, metaImageBytesSchema } from './contracts.js';
import { metaMcpMapping } from './meta-mcp/mapping.js';
import { metaMcpSnapshot } from './meta-mcp/snapshot.js';

export const id = z.string().regex(/^(?:act_)?\d+$/, 'Use a numeric platform ID (Meta accounts may start with act_)');
const record = z.record(z.unknown());
const scope = { accountId: id, operationId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional() };
export type Platform = 'meta' | 'google' | 'ga4';
export interface AdsTool {
  name: string; description: string; platform: Platform; write: boolean; schema: z.ZodTypeAny;
  action: string; resource?: string; parent?: string;
  /** Published as-is instead of converting `schema` (Meta MCP tools carry Meta's own JSON schema). */
  jsonSchema?: Record<string, unknown>;
}
export const adsTools: AdsTool[] = [];
function add(tool: AdsTool) { adsTools.push(tool); }
const money = z.number().finite().nonnegative();
add({ name: 'ads_provider_versions', description: 'Read persisted provider versions, capability statuses, deprecations, attribution rules, and verification dates.', platform: 'meta', write: false, action: 'provider_versions', schema: z.object({}).strict() });
for (const [name, platform] of [['meta_ads_capabilities','meta'],['google_ads_capabilities','google'],['ga4_capabilities','ga4']] as const)
  add({ name, description: `Read ${platform} feature support and verification status.`, platform, write: false, action: 'provider_capabilities', schema: z.object({}).strict() });
add({ name: 'meta_ads_readiness', description: 'Assess Meta account, identity, dataset, payment, permission, access-tier, token, and asset readiness; return manual handoffs.', platform: 'meta', write: false, action: 'meta_readiness', schema: z.object({ accountId: id, snapshot: record.default({}) }).strict() });
add({ name: 'meta_ads_validate_campaign', description: 'Validate and persist a typed Meta campaign draft without making a provider request.', platform: 'meta', write: false, action: 'meta_validate', schema: z.object({ draftId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), spec: record }).strict() });
add({ name: 'meta_ads_prepare_launch', description: 'Prepare a validated paused Meta hierarchy and decision-ready approval brief.', platform: 'meta', write: false, action: 'meta_prepare_launch', schema: z.object({ launchId: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/), accountId: id, spec: record }).strict() });
add({ name: 'google_ads_readiness', description: 'Assess Google Ads account, access, billing, tracking, conversion, policy, destination, and Merchant Center readiness.', platform: 'google', write: false, action: 'google_readiness', schema: z.object({ accountId: id, snapshot: record.default({}) }).strict() });
add({ name: 'google_ads_validate_search_campaign', description: 'Validate and persist a typed Google Search campaign draft; provider validateOnly remains required.', platform: 'google', write: false, action: 'google_validate_search', schema: z.object({ draftId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), spec: record }).strict() });
add({ name: 'google_ads_validate_campaign_type', description: 'Gate post-Search Google campaign types on their required assets, feeds, values, app events, and rollout predecessor.', platform: 'google', write: false, action: 'google_validate_campaign_type', schema: z.object({ draftId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), campaignType: z.enum(['PERFORMANCE_MAX','SHOPPING','DEMAND_GEN','DISPLAY','APP','LEGACY_VIDEO']), evidence: record.default({}) }).strict() });
add({ name: 'google_ads_prepare_search_launch', description: 'Prepare stable validateOnly-first Google Search launch steps after a persisted Meta paused-lifecycle verification.', platform: 'google', write: false, action: 'google_prepare_search', schema: z.object({ launchId: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/), accountId: id, spec: record }).strict() });
add({ name: 'google_ads_report_templates', description: 'Return versioned GAQL report templates that preserve campaign and ad-group scope.', platform: 'google', write: false, action: 'google_report_templates', schema: z.object({}).strict() });
const googleMutationResource = z.enum(['campaigns','campaignBudgets','adGroups','adGroupAds','adGroupCriteria','campaignCriteria','sharedSets','sharedCriteria','campaignSharedSets','biddingStrategies','assets','campaignAssets','adGroupAssets','customerAssets','assetGroups','assetGroupAssets','assetGroupSignals','userLists','customAudiences','combinedAudiences','labels','campaignLabels','adGroupLabels','adGroupAdLabels','conversionActions','conversionCustomVariables','conversionValueRules','conversionValueRuleSets','experiments','experimentArms']);
const googleOperation = z.union([
  z.object({ create: record }).strict(), z.object({ update: record, updateMask: z.string().min(1) }).strict(), z.object({ remove: z.string().regex(/^customers\/\d+\/[A-Za-z]+\/[^/]+$/) }).strict()
]);
add({ name: 'google_ads_validate_operations', description: 'Run Google validateOnly for an exact paused mutation payload before approval; makes no provider changes.', platform: 'google', write: false, action: 'google_validate_operations', schema: z.object({ accountId: id, resource: googleMutationResource, operations: z.array(googleOperation).min(1).max(1000) }).strict() });
add({ name: 'google_ads_verify_operation', description: 'Poll a previously dispatched Google long-running operation without redispatching it.', platform: 'google', write: false, action: 'google_verify_operation', schema: z.object({ operationId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict() });
add({ name: 'ga4_readiness', description: 'Assess GA4 property, streams, tag, events, links, consent, cross-domain, and campaign-identifier readiness.', platform: 'ga4', write: false, action: 'ga4_readiness', schema: z.object({ accountId: id, snapshot: record.default({}) }).strict() });
add({ name: 'ga4_tracking_audit', description: 'Audit supplied GA4 tracking and data-quality evidence; defects reduce recommendation confidence.', platform: 'ga4', write: false, action: 'ga4_audit', schema: z.object({ accountId: id, evidence: record.default({}) }).strict() });
add({ name: 'ga4_validate_report', description: 'Validate and persist a GA4 report definition before metadata compatibility checks.', platform: 'ga4', write: false, action: 'ga4_validate_report', schema: z.object({ reportId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), spec: record }).strict() });
add({ name: 'ga4_run_validated_report', description: 'Validate a GA4 report, check live metadata compatibility, run it, and persist quality metadata.', platform: 'ga4', write: false, action: 'ga4_run_validated_report', schema: z.object({ reportId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), accountId: id, timezone: z.string().min(1), currency: z.string().regex(/^[A-Z]{3}$/), spec: ga4ReportSpecSchema }).strict() });
add({ name: 'ga4_create_admin_proposal', description: 'Persist a GA4 Admin mutation proposal without dispatching it.', platform: 'ga4', write: false, action: 'ga4_admin_proposal', schema: z.object({ proposalId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), capability: z.string().regex(/^ga4_(?:create|update|delete)_/), input: record, rationale: z.string().min(1) }).strict() });
add({ name: 'ga4_report_templates', description: 'Return standard GA4 report templates for acquisition, campaigns, events, revenue, funnels, device/geography, and realtime health.', platform: 'ga4', write: false, action: 'ga4_report_templates', schema: z.object({}).strict() });
add({ name: 'ads_create_recommendation', description: 'Persist an evidence-backed optimization proposal; never execute it automatically.', platform: 'meta', write: false, action: 'create_recommendation', schema: z.object({ recommendationId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), provider: z.enum(['meta','google','ga4']), accountId: id, action: z.string().min(1), evidencePeriod: z.object({ since: z.string().date(), until: z.string().date() }).strict(), timezone: z.string().min(1), currency: z.string().regex(/^[A-Z]{3}$/), dataQualityWarnings: z.array(z.string()).default([]), conversionLag: z.string().min(1), minimumDataStatus: z.enum(['MET','NOT_MET','UNKNOWN']), expectedResult: z.string().min(1), confidence: z.number().min(0).max(1), cooldownDays: z.number().int().nonnegative(), evaluationDate: z.string().date(), stopCondition: z.string().min(1), proposedOperations: z.array(record).min(1) }).strict() });
add({ name: 'ads_schedule_monitoring', description: 'Persist and enqueue a 90-day baseline plus daily 08:00 account-time read-only monitoring.', platform: 'meta', write: false, action: 'schedule_monitoring', schema: z.object({ scheduleId: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/), provider: z.enum(['meta','google','ga4']), accountId: id, timezone: z.string().min(1), currency: z.string().regex(/^[A-Z]{3}$/) }).strict() });
add({ name: 'ads_findings', description: "Rules-based review of a Meta account for the client's goal (leads or purchases): last N complete days vs the N before. Returns findings with evidence, ranked next actions (writes are only listed, never sent) and data status. No LLM.", platform: 'meta', write: false, action: 'findings',
  schema: z.object({ accountId: id, days: z.number().int().min(3).max(30).default(7) }).strict() });
add({ name: 'ads_list_records', description: 'List persisted ads planning, reporting, recommendation, schedule, and audit records by kind.', platform: 'meta', write: false, action: 'list_records', schema: z.object({ kind: z.enum(['meta_readiness','google_readiness','ga4_readiness','meta_campaign_draft','google_campaign_draft','meta_launch','google_launch','google_validation','ga4_audit','ga4_report','report','recommendation','schedule','reconciliation','ga4_admin_proposal','findings']) }).strict() });
add({ name: 'ads_list_operations', description: 'List durable approvals and provider operations, including unresolved and failed states.', platform: 'meta', write: false, action: 'list_operations', schema: z.object({ statuses: z.array(z.enum(['DRAFT','PENDING_APPROVAL','AUTHORIZED','DISPATCHED','VERIFIED','REJECTED','FAILED','PARTIAL','UNCERTAIN'])).default([]) }).strict() });
add({ name: 'ads_reconcile_measurement', description: 'Keep platform, GA4, and deduplicated business outcome views separate.', platform: 'meta', write: false, action: 'reconcile', schema: z.object({
  currency: z.string().regex(/^[A-Z]{3}$/), since: z.string().date(), until: z.string().date(), timezone: z.string().min(1),
  alignment: z.object({ campaignIds: z.literal(true), utmKeys: z.array(z.string().min(1)).min(1), conversionDefinitions: z.literal(true), currencies: z.literal(true) }).strict(),
  platform: z.array(z.object({ provider: z.enum(['meta','google']), currency: z.string().regex(/^[A-Z]{3}$/), campaignId: z.string().optional(), clickIds: z.array(z.string()).default([]), spend: money, attributedRevenue: money.optional() }).passthrough()),
  ga4: z.array(z.object({ campaignId: z.string().min(1), currency: z.string().regex(/^[A-Z]{3}$/), clickIds: z.array(z.string()).default([]), attributedRevenue: money.optional() }).passthrough()),
  outcomes: z.array(z.object({ externalId: z.string().min(1), occurredAt: z.string().datetime(), outcomeType: z.string().min(1), value: money, currency: z.string().regex(/^[A-Z]{3}$/), leadStatus: z.string().optional(), campaignId: z.string().optional(), clickId: z.string().optional() }).strict().refine(value => Boolean(value.campaignId || value.clickId), 'Each outcome needs a campaignId or clickId'))
}).strict() });
add({ name: 'ads_compare_performance', description: 'Compare supplied platform metrics without adding overlapping attributed revenue. Deduplicate order revenue for blended ROAS.', platform: 'meta', write: false, action: 'compare',
  schema: z.object({ currency: z.string().regex(/^[A-Z]{3}$/), since: z.string().date(), until: z.string().date(),
    channels: z.array(z.object({ platform: z.enum(['meta','google']), currency: z.string(), spend: money, attributedRevenue: money.optional(), qualifiedLeads: z.number().int().nonnegative().optional(), newCustomers: z.number().int().nonnegative().optional() }).strict()).min(1),
    orders: z.array(z.object({ orderId: z.string().min(1), currency: z.string(), revenue: money }).strict()).optional()
  }).strict() });
const period = z.object({ impressions: z.number().int().nonnegative(), clicks: z.number().int().nonnegative(), spend: money, conversions: money, frequency: money.optional() }).strict();
add({ name: 'ads_analyze_creative', description: 'Evaluate supplied comparable mature periods; return review suggestions, not automatic pauses', platform: 'meta', write: false, action: 'analyze',
  schema: z.object({ adId: id, baseline: period, current: period, conversionLagElapsed: z.boolean(), minimumImpressions: z.number().int().positive().default(1000), minimumConversions: z.number().int().positive().default(10) }).strict() });
add({ name: 'ads_publish_meta_creative', description: 'Upload an image and create/read back its complete Meta creative under ONE approval covering the image, copy, identity, destination and CTA. Use instead of separate image and creative write approvals. Does not create or activate an ad.', platform: 'meta', write: true, action: 'publish_creative', resource: 'adcreatives',
  schema: z.object({ ...scope, name: z.string().min(1), pageId: id, imageBytes: metaImageBytesSchema, primaryText: z.string().min(1), headline: z.string().optional(), description: z.string().optional(), destinationUrl: z.string().url(), callToAction: z.string().min(1) }).strict() });
add({ name: 'ads_launch_meta', description: 'Preferred for new Meta campaigns: submit the complete campaign, ad set, creative media and copy, and ad together under ONE exact-payload approval. Do not stage separate child approvals. Requires persisted account readiness; creates and verifies the hierarchy PAUSED.', platform: 'meta', write: true, action: 'launch', resource: 'hierarchy',
  schema: z.object({ accountId: id, launchId: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/), operationId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(), spec: metaCampaignSpecSchema, providerPayload: z.object({ campaign: record, adset: record, creative: record, ad: record }).strict().optional() }).strict() });
add({ name: 'ads_continue_meta_launch', description: 'Continue a PARTIAL Meta hierarchy from persisted child IDs under a new exact approval. launchId is the latest PARTIAL launch or continuation operation ID. Each source can have only one active continuation; UNCERTAIN outcomes require manual reconciliation.', platform: 'meta', write: true, action: 'continue_launch', resource: 'hierarchy',
  schema: z.object({ accountId: id, launchId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), operationId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), providerPayload: z.object({ campaign: record, adset: record, creative: record, ad: record }).strict().optional(), existingIds: z.record(z.string()).optional() }).strict() });

// Only documented object families are exposed. Account eligibility is checked by the provider.
const metaResources: Array<[string, string, z.ZodRawShape, string]> = [
  ['campaign', 'campaigns', { name: z.string().min(1), objective: z.enum(['OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_APP_PROMOTION','OUTCOME_SALES']), status: z.enum(['PAUSED','ACTIVE']).default('PAUSED'), special_ad_categories: z.array(z.string()).default([]) }, 'account'],
  ['adset', 'adsets', { name: z.string().min(1), campaign_id: id, targeting: record, optimization_goal: z.string(), billing_event: z.string(), status: z.enum(['PAUSED','ACTIVE']).default('PAUSED') }, 'account'],
  ['ad', 'ads', { name: z.string().min(1), adset_id: id, creative: z.object({ creative_id: id }), status: z.enum(['PAUSED','ACTIVE']).default('PAUSED') }, 'account'],
  ['creative', 'adcreatives', { name: z.string().min(1) }, 'account'],
  ['audience', 'customaudiences', { name: z.string().min(1), subtype: z.string() }, 'account'],
  ['label', 'adlabels', { name: z.string().min(1) }, 'account'],
  ['catalog', 'owned_product_catalogs', { name: z.string().min(1) }, 'business'],
  ['product_set', 'product_sets', { name: z.string().min(1), filter: record }, 'catalog'],
  ['product_feed', 'product_feeds', { name: z.string().min(1) }, 'catalog'],
  ['lead_form', 'leadgen_forms', { name: z.string().min(1), questions: z.array(record).min(1), privacy_policy: record }, 'page']
];
for (const [name, edge, shape, parent] of metaResources) {
  for (const action of ['list', 'get', 'create', 'update', 'delete']) {
    // Creatives and lead forms have constrained/immutable fields; do not promise general updates.
    if (action === 'update' && ['creative', 'lead_form'].includes(name)) continue;
    add({ name: `meta_ads_${action}_${name}`, description: `${action} Meta ${name}; ${parent}-scoped. Provider eligibility and review apply.`, platform: 'meta', write: ['create','update','delete'].includes(action), action, resource: edge, parent,
      schema: z.object({ ...scope,
        ...(parent !== 'account' ? { parentId: id } : {}),
        ...(['get','update','delete'].includes(action) ? { objectId: id } : {}),
        ...(['list','get'].includes(action) ? { fields: z.array(z.string().regex(/^[a-zA-Z0-9_{}.,]+$/)).default(['id','name']), params: record.default({}) } : {}),
        ...(action === 'create' ? { data: z.object(shape).passthrough() } : {}),
        ...(action === 'update' ? { data: record.refine(v => Object.keys(v).length > 0, 'Provide update fields') } : {})
      }).strict() });
  }
}
for (const [name, edge, parent] of [
  ['leads','leads','object'], ['test_leads','test_leads','object'], ['products','products','catalog'],
  ['feed_uploads','uploads','object'], ['pixels','adspixels','account'], ['pages','owned_pages','business'],
  ['business_users','business_users','business'], ['instagram_accounts','instagram_accounts','page']
] as const) add({ name: `meta_ads_list_${name}`, description: `Read Meta ${name}`, platform: 'meta', write: false, action: 'edge', resource: edge, parent,
  schema: z.object({ ...scope, ...(parent !== 'account' ? { parentId: id } : {}), fields: z.array(z.string()).default(['id']), params: record.default({}) }).strict() });
add({ name: 'meta_ads_list_accounts', description: 'List accessible ad accounts', platform: 'meta', write: false, action: 'accounts', schema: z.object({}).strict() });
add({ name: 'meta_ads_insights', description: 'Paginated insights at account/campaign/adset/ad level', platform: 'meta', write: false, action: 'insights', schema: z.object({ ...scope, objectId: id.optional(), level: z.enum(['account','campaign','adset','ad']).default('campaign'), since: z.string().date(), until: z.string().date(), fields: z.array(z.string()).default(['campaign_id','spend','impressions','clicks','actions','action_values']), breakdowns: z.array(z.string()).default([]), timeIncrement: z.union([z.literal('all_days'), z.number().int().positive()]).default(1) }).strict() });
add({ name: 'meta_ads_run_monitoring', description: 'Run a persisted Meta monitoring window ending yesterday; used by durable scheduled jobs.', platform: 'meta', write: false, action: 'meta_daily_monitor', schema: z.object({ accountId: id, timezone: z.string().min(1), currency: z.string().regex(/^[A-Z]{3}$/), days: z.number().int().min(1).max(90).default(7) }).strict() });
for (const [name, action, resource, data] of [
  ['upload_image', 'create', 'adimages', z.object({ bytes: z.string().min(1) }).strict()],
  ['upload_video', 'create', 'advideos', z.object({ file_url: z.string().url(), title: z.string().optional() }).strict()],
  ['audience_add_users', 'object_post', 'users', z.object({ payload: record, session: record.optional() }).strict()],
  ['send_conversion_events', 'object_post', 'events', z.object({ data: z.array(record).min(1), test_event_code: z.string().optional() }).strict()],
  ['create_test_lead', 'object_post', 'test_leads', record],
  ['upload_feed', 'object_post', 'uploads', z.object({ url: z.string().url() }).passthrough()],
  ['create_page_post', 'object_post', 'feed', z.object({ message: z.string().min(1) }).passthrough()]
] as const) add({ name: `meta_ads_${name}`, description: `Meta ${name}; explicit scoped operation`, platform: 'meta', write: true, action, resource,
  schema: z.object({ ...scope, ...(action === 'object_post' ? { objectId: id } : {}), data }).strict() });
add({ name: 'meta_ads_search_targeting', description: 'Discover available targeting options', platform: 'meta', write: false, action: 'targeting', schema: z.object({ ...scope, type: z.enum(['adinterest','adinterestsuggestion','adgeolocation','adTargetingCategory']), q: z.string().optional(), params: record.default({}) }).strict() });
add({ name: 'meta_ads_list_budget_schedules', description: 'Read campaign budget schedules; capability remains unverified until pinned-version account testing.', platform: 'meta', write: false, action: 'edge', resource: 'budget_schedules', parent: 'campaign', schema: z.object({ accountId: id, parentId: id, fields: z.array(z.string()).default(['id','budget_value','budget_value_type','time_start','time_end']), params: record.default({}) }).strict() });
add({ name: 'meta_ads_create_budget_schedule', description: 'Create an unverified campaign budget schedule under exact approval; daily-budget campaigns only.', platform: 'meta', write: true, action: 'create', resource: 'budget_schedules', parent: 'campaign', schema: z.object({ ...scope, parentId: id, data: z.object({ budget_value: z.number().positive(), budget_value_type: z.enum(['ABSOLUTE','MULTIPLIER']), time_start: z.string().datetime(), time_end: z.string().datetime() }).strict() }).strict() });

add({ name: 'google_ads_search', description: 'Read Google Ads with GAQL, collecting all pages', platform: 'google', write: false, action: 'search', schema: z.object({ ...scope, query: z.string().min(1), timezone: z.string().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional() }).strict() });
add({ name: 'google_ads_list_accounts', description: 'List accessible Google Ads customers', platform: 'google', write: false, action: 'accounts', schema: z.object({}).strict() });
for (const resource of googleMutationResource.options) {
  add({ name: `google_ads_mutate_${resource}`, description: `Create/update/remove ${resource} through typed Google operations. Use updateMask for updates; partial failures remain visible.`, platform: 'google', write: true, action: 'mutate', resource,
    schema: z.object({ ...scope, operations: z.array(googleOperation).min(1).max(1000), partialFailure: z.boolean().default(false), validateOnly: z.boolean().default(false) }).strict() });
}
for (const [name, action, write] of [
  ['keyword_ideas','generateKeywordIdeas',false], ['keyword_historical_metrics','generateKeywordHistoricalMetrics',false],
  ['keyword_forecast','generateKeywordForecastMetrics',false], ['upload_click_conversions','uploadClickConversions',true],
  ['upload_conversion_adjustments','uploadConversionAdjustments',true], ['create_customer_match_job','offlineUserDataJobs:create',true]
] as const) add({ name: `google_ads_${name}`, description: `Google Ads ${name}; account eligibility required`, platform: 'google', write, action, schema: z.object({ ...scope, data: record }).strict() });

for (const [name, resource, method] of [
  ['schedule_experiment','experiments','scheduleExperiment'], ['promote_experiment','experiments','promoteExperiment'],
  ['end_experiment','experiments','endExperiment'], ['graduate_experiment','experiments','graduateExperiment'],
  ['add_customer_match_operations','offlineUserDataJobs','addOperations'], ['run_customer_match_job','offlineUserDataJobs','run']
] as const) add({ name: `google_ads_${name}`, description: `Google Ads ${name}; asynchronous acceptance does not mean completion`, platform: 'google', write: true, action: 'resource_action', resource,
  schema: z.object({ ...scope, objectId: id, data: record.default({}) }).strict(), parent: method });

for (const method of ['runReport','runPivotReport','runRealtimeReport','runFunnelReport','checkCompatibility']) add({ name: `ga4_${method}`, description: `GA4 Data API ${method}${method === 'runFunnelReport' ? ' (unstable v1alpha; explicit funnel definition required)' : ''}`, platform: 'ga4', write: false, action: method,
  schema: z.object({ ...scope, data: record }).strict() });
add({ name: 'ga4_metadata', description: 'GA4 available dimensions and metrics', platform: 'ga4', write: false, action: 'metadata', schema: z.object(scope).strict() });
const adminResources = ['audiences','channelGroups','dataStreams','keyEvents','googleAdsLinks','bigQueryLinks','displayVideo360AdvertiserLinks','searchAds360Links','firebaseLinks','reportingDataAnnotations'];
for (const resource of adminResources) {
  const actions = ['audiences','channelGroups','dataStreams','keyEvents','reportingDataAnnotations'].includes(resource) ? ['list','create','update','delete'] : ['list','create','delete'];
  for (const action of actions) {
    add({ name: `ga4_${action}_${resource}`, description: `GA4 Admin ${action} ${resource}`, platform: 'ga4', write: action !== 'list', action: `admin_${action}`, resource,
      schema: z.object({ ...scope, ...(action === 'update' || action === 'delete' ? { objectId: id } : {}), ...(action === 'create' || action === 'update' ? { data: record } : {}), ...(action === 'update' ? { updateMask: z.string().min(1) } : {}) }).strict() });
  }
}
for (const resource of ['attributionSettings','dataRetentionSettings']) for (const action of resource === 'attributionSettings' ? ['get'] : ['get','update']) add({ name: `ga4_${action}_${resource}`, description: `GA4 ${action} ${resource}`, platform: 'ga4', write: action === 'update', action: `settings_${action}`, resource,
  schema: z.object({ ...scope, ...(action === 'update' ? { data: record, updateMask: z.string().min(1) } : {}) }).strict() });

for (const action of ['get','update']) add({ name: `ga4_${action}_enhancedMeasurementSettings`, description: `GA4 ${action} web-stream enhanced measurement`, platform: 'ga4', write: action === 'update', action: `settings_${action}`, resource: 'enhancedMeasurementSettings',
  schema: z.object({ ...scope, streamId: id, ...(action === 'update' ? { data: record, updateMask: z.string().min(1) } : {}) }).strict() });

// Meta's Ads MCP server, proxied. Meta's arguments go under `arguments` unchanged; accountId/operationId feed the
// same allowlist, approval and journal gates as native writes. Unclassified tools are not registered.
for (const tool of metaMcpSnapshot.tools) {
  const rule = metaMcpMapping[tool.name];
  if (!rule) continue;
  const operationId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
  add({ name: `meta_mcp_${tool.name}`, description: `[Meta Ads MCP] ${tool.description}${rule.blocked ? ` BLOCKED: ${rule.blocked}` : ''}`, platform: 'meta', write: rule.write, action: 'meta_mcp', resource: tool.name,
    schema: z.object({ accountId: rule.write ? id : id.optional(), operationId: operationId.optional(), arguments: record.default({}) }).strict(),
    jsonSchema: { type: 'object', additionalProperties: false, required: rule.write ? ['accountId'] : [], properties: {
      accountId: { type: 'string', pattern: '^(?:act_)?\\d+$', description: 'Ad account id; must be in the ads allowlist for writes' },
      operationId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,100}$', description: 'Stable id for live writes; reuse it to resume' },
      arguments: { ...tool.inputSchema, description: "Passed unchanged to Meta's tool" } } } });
}

export const adsToolMap = new Map(adsTools.map(tool => [tool.name, tool]));
