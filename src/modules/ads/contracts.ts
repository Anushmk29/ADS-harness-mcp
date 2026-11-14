import { z } from 'zod';

export type CapabilityStatus = 'SUPPORTED' | 'MANUAL' | 'UNVERIFIED' | 'DEPRECATED' | 'UNSUPPORTED';

export interface ProviderCapability {
  id: string;
  status: CapabilityStatus;
  evidence: string;
  verifiedAt: string | null;
}

export interface ProviderVersionManifest {
  provider: 'meta' | 'google' | 'ga4';
  apiVersion: string;
  minorVersion?: string;
  accessModel: string[];
  capabilities: ProviderCapability[];
  deprecatedFields: string[];
  prohibitedPlacements: string[];
  attributionRules: string[];
  evidence: string[];
  verifiedAt: string | null;
  nextReviewAt: string;
}

const unverified = (id: string, evidence: string): ProviderCapability => ({ id, status: 'UNVERIFIED', evidence, verifiedAt: null });

export function defaultProviderManifests(): ProviderVersionManifest[] {
  return [
    {
      provider: 'meta', apiVersion: 'v26.0', accessModel: ['Limited', 'Full'], verifiedAt: null, nextReviewAt: '2026-10-27',
      capabilities: [
        ...['awareness','traffic','engagement','leads','sales','app_promotion','budget_schedules','advantage_state_info'].map(id => unverified(id, 'Requires paused-object account test')),
        { id: 'regulated_special_ad_categories', status: 'MANUAL', evidence: 'Blocked from self-service v1', verifiedAt: null },
        { id: 'instagram_explore_feed', status: 'DEPRECATED', evidence: 'Excluded from the versioned allowlist', verifiedAt: null },
        { id: 'messenger_stories', status: 'DEPRECATED', evidence: 'Excluded from the versioned allowlist', verifiedAt: null },
        { id: 'poll_ad_creation', status: 'UNSUPPORTED', evidence: 'New poll creation excluded', verifiedAt: null }
      ],
      deprecatedFields: ['legacy_advantage_plus_switches','7d_view','28d_view'],
      prohibitedPlacements: ['instagram_explore_feed','messenger_stories'],
      attributionRules: ['standard attribution by default','7-day and 28-day view windows prohibited'],
      evidence: ['Meta Marketing API v26 contract','Meta Ads Automation product brief']
    },
    {
      provider: 'google', apiVersion: 'v25', minorVersion: 'v25.2', accessModel: ['Test','Explorer','Basic','Standard'], verifiedAt: null, nextReviewAt: '2026-10-29',
      capabilities: [
        ...['gaql_reporting','search_campaigns','performance_max','shopping','demand_gen','display','app_campaigns','experiments'].map(id => unverified(id, 'Requires developer-token test-account verification')),
        { id: 'legacy_video_creation', status: 'UNSUPPORTED', evidence: 'Legacy VideoAd is reporting-only', verifiedAt: null }
      ],
      deprecatedFields: ['legacy_video_ad_creation'], prohibitedPlacements: [],
      attributionRules: ['cost_micros is micros','conversion values retain documented units'],
      evidence: ['Google Ads API v25 contract','v25.2 capability review']
    },
    {
      provider: 'ga4', apiVersion: 'v1beta', minorVersion: 'Admin v1alpha', accessModel: ['property viewer','property editor','administrator'], verifiedAt: null, nextReviewAt: '2026-10-29',
      capabilities: [
        ...['standard_reports','pivot_reports','realtime_reports','funnel_reports','tracking_audits','admin_proposals'].map(id => unverified(id, 'Requires property comparison and permission test')),
        { id: 'measurement_protocol', status: 'MANUAL', evidence: 'Consent-sensitive and separately configured', verifiedAt: null },
        { id: 'arbitrary_attribution_model_changes', status: 'UNSUPPORTED', evidence: 'Only documented Admin settings are exposed', verifiedAt: null }
      ],
      deprecatedFields: [], prohibitedPlacements: [],
      attributionRules: ['GA4 attribution remains separate from platform attribution','alpha Admin features are unstable'],
      evidence: ['GA4 Data API v1beta contract','GA4 Admin API v1alpha contract']
    }
  ];
}

export type ReadinessStatus = 'READY' | 'BLOCKED' | 'MANUAL_STEP_REQUIRED' | 'UNVERIFIED';
export interface ManualHandoff { id: string; owner: 'operator' | 'agency' | 'developer'; reason: string; requiredAction: string; status: 'OPEN'; }
export interface ReadinessCheck { id: string; status: ReadinessStatus; reason: string; verifiedAt: string | null; }

export function assessMetaReadiness(accountId: string, snapshot: Record<string, any>) {
  const checked = new Date().toISOString();
  const checks: ReadinessCheck[] = [
    ['business_manager', snapshot.businessManagerId ? 'READY' : 'UNVERIFIED', 'Business Manager access'],
    ['facebook_page', snapshot.pageId ? 'READY' : 'MANUAL_STEP_REQUIRED', 'Facebook Page identity'],
    ['instagram_identity', snapshot.instagramId ? 'READY' : 'UNVERIFIED', 'Instagram identity'],
    ['dataset', snapshot.datasetId ? 'READY' : 'MANUAL_STEP_REQUIRED', 'Dataset/Pixel and conversion events'],
    ['payment_method', snapshot.paymentReady === true ? 'READY' : snapshot.paymentReady === false ? 'BLOCKED' : 'MANUAL_STEP_REQUIRED', 'Payment readiness'],
    ['business_verification', snapshot.businessVerified === true ? 'READY' : snapshot.businessVerified === false ? 'BLOCKED' : 'MANUAL_STEP_REQUIRED', 'Business verification'],
    ['ads_management', snapshot.adsManagement === true ? 'READY' : snapshot.adsManagement === false ? 'BLOCKED' : 'UNVERIFIED', 'ads_management permission'],
    ['access_tier', ['Limited','Full'].includes(snapshot.accessTier) ? 'READY' : 'UNVERIFIED', 'Marketing API access tier'],
    ['token_health', snapshot.tokenHealthy === true ? 'READY' : snapshot.tokenHealthy === false ? 'BLOCKED' : 'UNVERIFIED', 'Token health'],
    ['asset_access', snapshot.assetAccessHealthy === true ? 'READY' : snapshot.assetAccessHealthy === false ? 'BLOCKED' : 'UNVERIFIED', 'Asset access']
  ].map(([id, status, reason]) => ({ id, status, reason, verifiedAt: status === 'READY' ? checked : null } as ReadinessCheck));
  const handoffs: ManualHandoff[] = [];
  const add = (id: string, reason: string, requiredAction: string, owner: ManualHandoff['owner'] = 'operator') => handoffs.push({ id, reason, requiredAction, owner, status: 'OPEN' });
  if (snapshot.paymentReady !== true) add('payment_method', 'Meta cannot deliver without billing readiness', 'Add and verify the payment method in Business Manager');
  if (snapshot.businessVerified !== true) add('business_verification', 'Business verification is provider-controlled', 'Complete Meta business verification');
  if (!snapshot.datasetId) add('dataset_capi', 'Sales and website optimization need a dataset and reliable events', 'Install Pixel/dataset and Conversions API', 'developer');
  if (snapshot.requiresWhatsapp && !snapshot.whatsappConnected) add('whatsapp_connection', 'WhatsApp destination is not connected', 'Connect WhatsApp to the Facebook Page');
  if (snapshot.requiresApp && !(snapshot.appId && snapshot.appEventsConfigured)) add('app_sdk_events', 'App promotion requires an app and verified events', 'Configure the app SDK and app events', 'developer');
  if (snapshot.requiresSales && !(snapshot.datasetId && snapshot.purchaseEventReady && snapshot.capiReady)) add('sales_measurement', 'Sales needs a verified purchase event, value, and server/browser measurement', 'Verify Purchase, value/currency, Pixel, and Conversions API', 'developer');
  add('policy_remediation', 'Meta review and appeals remain provider/manual decisions', 'Review rejection details and submit any appeal', 'agency');
  add('creative_scaling_judgment', 'Creative quality and scaling require accountable human judgment', 'Review creative quality, fatigue, and scaling proposal', 'agency');
  add('customer_lifecycle_strategy', 'Customer lifecycle strategy remains an Ads Manager/manual setting', 'Configure lifecycle strategy in Ads Manager when applicable', 'agency');
  return {
    provider: 'meta', accountId, currency: snapshot.currency ?? null, timezone: snapshot.timezone ?? null,
    accessTier: snapshot.accessTier ?? null, checks, manualHandoffs: handoffs,
    assetInventory: { businessManagerId: snapshot.businessManagerId ?? null, pageId: snapshot.pageId ?? null, instagramId: snapshot.instagramId ?? null, datasetId: snapshot.datasetId ?? null, conversionEvents: snapshot.conversionEvents ?? [], whatsappConnected: snapshot.whatsappConnected ?? null, appId: snapshot.appId ?? null, appEventsConfigured: snapshot.appEventsConfigured ?? null },
    ready: Boolean(snapshot.currency && snapshot.timezone && checks.every(check => check.status === 'READY' || ['instagram_identity','dataset'].includes(check.id))
      && (!snapshot.requiresWhatsapp || snapshot.whatsappConnected)
      && (!snapshot.requiresApp || (snapshot.appId && snapshot.appEventsConfigured))
      && (!snapshot.requiresSales || (snapshot.datasetId && snapshot.purchaseEventReady && snapshot.capiReady))),
    checkedAt: checked
  };
}

const budgetScheduleSchema = z.object({ amount: z.number().positive(), type: z.enum(['ABSOLUTE','MULTIPLIER']), startTime: z.string().datetime(), endTime: z.string().datetime() }).strict();
const metaCampaignSchema = z.object({
  name: z.string().min(1), objective: z.enum(['OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_APP_PROMOTION','OUTCOME_SALES']),
  budgetOwner: z.enum(['CAMPAIGN','AD_SET']), dailyBudget: z.number().int().positive().optional(), lifetimeBudget: z.number().int().positive().optional(),
  bidStrategy: z.enum(['LOWEST_COST_WITHOUT_CAP','COST_CAP','LOWEST_COST_WITH_BID_CAP','LOWEST_COST_WITH_MIN_ROAS']),
  specialAdCategories: z.array(z.string()), status: z.enum(['PAUSED','ACTIVE']).optional(), budgetSchedules: z.array(budgetScheduleSchema).default([])
}).strict();
const metaAdSetSchema = z.object({
  name: z.string().min(1), conversionLocation: z.enum(['ON_AD','WEBSITE','APP','MESSAGING','WHATSAPP','CALLS','INSTANT_FORM','INSTAGRAM_PROFILE','SHOP']),
  performanceGoal: z.enum(['MAXIMIZE_REACH','IMPRESSIONS','LINK_CLICKS','LANDING_PAGE_VIEWS','POST_ENGAGEMENT','MESSAGES','VIDEO_VIEWS','LEAD_GENERATION','CONVERSIONS','OFFSITE_CONVERSIONS','VALUE','APP_INSTALLS','APP_EVENTS']),
  billingEvent: z.string().min(1), targeting: z.record(z.unknown()), placements: z.array(z.string()).default([]), placementExclusions: z.array(z.string()).default([]),
  advantageAudience: z.boolean().default(false), datasetId: z.string().optional(), appId: z.string().optional(), promotedObject: z.record(z.unknown()).optional(),
  purchaseValueSource: z.boolean().default(false), purchaseEventReady: z.boolean().default(false), appEventsReady: z.boolean().default(false), attributionWindows: z.array(z.enum(['1d_click','7d_click','1d_view'])).default([]), status: z.enum(['PAUSED','ACTIVE']).optional()
}).strict();
const metaAdSchema = z.object({
  name: z.string().min(1), pageId: z.string().min(1), instagramActorId: z.string().optional(),
  creative: z.object({ existingPostId: z.string().optional(), imageHash: z.string().optional(), videoId: z.string().optional() }).strict().refine(value => Boolean(value.existingPostId || value.imageHash || value.videoId), 'Provide an existing post, image hash, or video ID'),
  destinationUrl: z.string().url().optional(), leadFormId: z.string().optional(), primaryText: z.string().min(1), headline: z.string().optional(), description: z.string().optional(), callToAction: z.string().min(1),
  urlParameters: z.record(z.string()).default({}), status: z.enum(['PAUSED','ACTIVE']).optional()
}).strict();
export const metaCampaignSpecSchema = z.object({ campaign: metaCampaignSchema, adSet: metaAdSetSchema, ad: metaAdSchema }).strict();
export type MetaCampaignSpec = z.infer<typeof metaCampaignSpecSchema>;

export interface MetaCompatibilityRule { objective: MetaCampaignSpec['campaign']['objective']; conversionLocation: MetaCampaignSpec['adSet']['conversionLocation']; performanceGoal: MetaCampaignSpec['adSet']['performanceGoal']; prerequisites: string[]; }
export const metaCompatibilityRules: MetaCompatibilityRule[] = [
  { objective: 'OUTCOME_AWARENESS', conversionLocation: 'ON_AD', performanceGoal: 'MAXIMIZE_REACH', prerequisites: [] },
  { objective: 'OUTCOME_AWARENESS', conversionLocation: 'ON_AD', performanceGoal: 'IMPRESSIONS', prerequisites: [] },
  { objective: 'OUTCOME_TRAFFIC', conversionLocation: 'WEBSITE', performanceGoal: 'LINK_CLICKS', prerequisites: ['destinationUrl'] },
  { objective: 'OUTCOME_TRAFFIC', conversionLocation: 'WEBSITE', performanceGoal: 'LANDING_PAGE_VIEWS', prerequisites: ['destinationUrl'] },
  { objective: 'OUTCOME_ENGAGEMENT', conversionLocation: 'ON_AD', performanceGoal: 'POST_ENGAGEMENT', prerequisites: [] },
  { objective: 'OUTCOME_ENGAGEMENT', conversionLocation: 'MESSAGING', performanceGoal: 'MESSAGES', prerequisites: [] },
  { objective: 'OUTCOME_LEADS', conversionLocation: 'INSTANT_FORM', performanceGoal: 'LEAD_GENERATION', prerequisites: ['leadForm'] },
  { objective: 'OUTCOME_LEADS', conversionLocation: 'WEBSITE', performanceGoal: 'CONVERSIONS', prerequisites: ['datasetId','destinationUrl'] },
  { objective: 'OUTCOME_SALES', conversionLocation: 'WEBSITE', performanceGoal: 'OFFSITE_CONVERSIONS', prerequisites: ['datasetId','purchaseEvent','destinationUrl'] },
  { objective: 'OUTCOME_SALES', conversionLocation: 'WEBSITE', performanceGoal: 'VALUE', prerequisites: ['datasetId','purchaseEvent','purchaseValueSource','destinationUrl'] },
  { objective: 'OUTCOME_APP_PROMOTION', conversionLocation: 'APP', performanceGoal: 'APP_INSTALLS', prerequisites: ['appId','appEvents'] },
  { objective: 'OUTCOME_APP_PROMOTION', conversionLocation: 'APP', performanceGoal: 'APP_EVENTS', prerequisites: ['appId','appEvents'] }
];

export function validateMetaCampaign(draftId: string, input: unknown) {
  const parsed = metaCampaignSpecSchema.safeParse(input);
  if (!parsed.success) return { draftId, valid: false, status: 'DRAFT', capabilityStatus: 'UNVERIFIED' as const, errors: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) };
  const spec = parsed.data;
  const errors: string[] = [];
  const rule = metaCompatibilityRules.find(candidate => candidate.objective === spec.campaign.objective && candidate.conversionLocation === spec.adSet.conversionLocation && candidate.performanceGoal === spec.adSet.performanceGoal);
  if (!rule) errors.push('Unsupported objective + conversion location + performance goal combination');
  if (spec.campaign.specialAdCategories.length) errors.push('Regulated special-ad categories require a manual handoff and cannot use self-service activation');
  const prohibited = [...spec.adSet.placements, ...spec.adSet.placementExclusions].filter(value => ['instagram_explore_feed','messenger_stories'].includes(value));
  if (prohibited.length) errors.push(`Deprecated or prohibited placement: ${prohibited.join(', ')}`);
  if (spec.adSet.attributionWindows.some(value => ['7d_view','28d_view'].includes(value))) errors.push('Removed 7-day or 28-day view attribution windows are not allowed');
  if (spec.campaign.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && (spec.adSet.performanceGoal !== 'VALUE' || !spec.adSet.purchaseValueSource)) errors.push('Minimum-ROAS bidding requires VALUE optimization and a purchase-value source');
  if (spec.campaign.budgetSchedules.length && !spec.campaign.dailyBudget) errors.push('Budget schedules require a daily budget');
  for (const schedule of spec.campaign.budgetSchedules) if (schedule.startTime >= schedule.endTime) errors.push('Budget schedule startTime must precede endTime');
  if (rule?.prerequisites.includes('datasetId') && !spec.adSet.datasetId) errors.push('A dataset is required for this compatibility rule');
  if (rule?.prerequisites.includes('appId') && !spec.adSet.appId) errors.push('An app ID is required for this compatibility rule');
  if (rule?.prerequisites.includes('leadForm') && !spec.ad.leadFormId) errors.push('A lead form is required for this compatibility rule');
  if (rule?.prerequisites.includes('purchaseEvent') && !spec.adSet.purchaseEventReady) errors.push('A verified purchase event is required for this compatibility rule');
  if (rule?.prerequisites.includes('appEvents') && !spec.adSet.appEventsReady) errors.push('Verified app events are required for this compatibility rule');
  if (rule?.prerequisites.includes('destinationUrl') && !spec.ad.destinationUrl) errors.push('A destination URL is required for this compatibility rule');
  const normalized = { ...spec, campaign: { ...spec.campaign, status: 'PAUSED' as const }, adSet: { ...spec.adSet, status: 'PAUSED' as const }, ad: { ...spec.ad, status: 'PAUSED' as const } };
  const predictedAdvantageState = spec.campaign.budgetOwner === 'CAMPAIGN' && spec.adSet.advantageAudience && spec.adSet.placementExclusions.length === 0;
  return { draftId, valid: errors.length === 0, status: errors.length ? 'DRAFT' : 'VALIDATED', capabilityStatus: 'UNVERIFIED' as const, spec: normalized, compatibilityRule: rule ?? null, predictedAdvantageState, errors, warnings: predictedAdvantageState ? ['Read back advantage_state_info after creation; prediction is not provider confirmation'] : [] };
}

export function assessGoogleReadiness(accountId: string, snapshot: Record<string, any>) {
  const checkedAt = new Date().toISOString();
  const values: Array<[string, boolean | undefined, string]> = [
    ['meta_lifecycle', snapshot.metaPausedLifecycleVerified, 'Meta paused lifecycle verification'], ['oauth', snapshot.oauthHealthy, 'OAuth or service-account access'], ['developer_token', Boolean(snapshot.developerTokenAccess), 'Developer token and access level'],
    ['billing', snapshot.billingReady, 'Billing and account status'], ['auto_tagging', snapshot.autoTagging, 'Auto-tagging'],
    ['conversion_actions', snapshot.conversionActionsReady, 'Conversion actions'], ['ga4_link', snapshot.ga4Linked, 'Google Ads–GA4 link'],
    ['destination', snapshot.destinationReady, 'Destination readiness'], ['policy', snapshot.policyReady, 'Brand and policy readiness']
  ];
  const checks: ReadinessCheck[] = values.map(([id, value, reason]) => ({ id, reason, status: value === true ? 'READY' : value === false ? 'BLOCKED' : 'UNVERIFIED', verifiedAt: value === true ? checkedAt : null }));
  const manualHandoffs: ManualHandoff[] = [];
  const add = (id: string, reason: string, requiredAction: string, owner: ManualHandoff['owner'] = 'operator') => manualHandoffs.push({ id, reason, requiredAction, owner, status: 'OPEN' });
  if (snapshot.billingReady !== true) add('billing', 'Campaigns cannot serve without an active billed account', 'Complete Google Ads billing and resolve account suspension');
  if (!snapshot.developerTokenAccess) add('developer_token', 'API access level is unknown', 'Select the developer token and record Test, Explorer, Basic, or Standard access', 'developer');
  if (snapshot.requiresMerchantCenter && !snapshot.merchantCenterReady) add('merchant_center', 'Shopping/PMax commerce requires a linked healthy feed', 'Link Merchant Center and resolve feed diagnostics');
  return { provider: 'google', accountId, managerCustomerId: snapshot.managerCustomerId ?? null, loginCustomerId: snapshot.loginCustomerId ?? null,
    currency: snapshot.currency ?? null, timezone: snapshot.timezone ?? null, developerTokenAccess: snapshot.developerTokenAccess ?? null,
    checks, manualHandoffs, ready: Boolean(snapshot.currency && snapshot.timezone && checks.every(check => check.status === 'READY')), checkedAt };
}

const rsaSchema = z.object({
  headlines: z.array(z.string().min(1).max(30)).min(3).max(15), descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
  finalUrls: z.array(z.string().url()).min(1), trackingTemplate: z.string().optional(), finalUrlSuffix: z.string().optional(), customParameters: z.record(z.string()).default({}), status: z.enum(['PAUSED','ENABLED']).optional()
}).strict();
export const googleSearchCampaignSpecSchema = z.object({
  campaign: z.object({ name: z.string().min(1), budgetMicros: z.number().int().positive(), biddingStrategy: z.enum(['MAXIMIZE_CLICKS','MAXIMIZE_CONVERSIONS','MAXIMIZE_CONVERSION_VALUE','TARGET_CPA','TARGET_ROAS']),
    networks: z.array(z.enum(['GOOGLE_SEARCH','SEARCH_PARTNERS'])).min(1), locations: z.array(z.string()).min(1), languages: z.array(z.string()).min(1),
    startDate: z.string().date().optional(), endDate: z.string().date().optional(), adSchedule: z.array(z.record(z.unknown())).default([]), conversionGoals: z.array(z.string()).min(1),
    negativeKeywords: z.array(z.string()).default([]), status: z.enum(['PAUSED','ENABLED']).optional() }).strict(),
  adGroups: z.array(z.object({ name: z.string().min(1), keywords: z.array(z.object({ text: z.string().min(1), matchType: z.enum(['EXACT','PHRASE','BROAD']) }).strict()).min(1),
    negativeKeywords: z.array(z.string()).default([]), responsiveSearchAd: rsaSchema }).strict()).min(1)
}).strict();

export function validateGoogleSearchCampaign(draftId: string, input: unknown) {
  const parsed = googleSearchCampaignSpecSchema.safeParse(input);
  if (!parsed.success) return { draftId, valid: false, status: 'DRAFT', capabilityStatus: 'UNVERIFIED' as const, providerValidateOnlyRequired: true, errors: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) };
  const spec = parsed.data;
  const errors: string[] = [];
  if (spec.campaign.startDate && spec.campaign.endDate && spec.campaign.startDate > spec.campaign.endDate) errors.push('Campaign startDate must be on or before endDate');
  const broadGroups = spec.adGroups.filter(adGroup => adGroup.keywords.some(keyword => keyword.matchType === 'BROAD'));
  if (broadGroups.length && spec.campaign.biddingStrategy === 'MAXIMIZE_CLICKS') errors.push('Broad match requires a Smart Bidding strategy (conversions, value, target CPA or target ROAS), not Maximize Clicks');
  const warnings = ['Google validateOnly must pass before approval','Policy acceptance and delivery require provider readback'];
  if (broadGroups.some(adGroup => !adGroup.negativeKeywords.length && !spec.campaign.negativeKeywords.length)) warnings.push('Broad match ad groups have no negative keywords; add themed negative lists before launch');
  const normalized = { campaign: { ...spec.campaign, status: 'PAUSED' as const }, adGroups: spec.adGroups.map(adGroup => ({ ...adGroup, responsiveSearchAd: { ...adGroup.responsiveSearchAd, status: 'PAUSED' as const } })) };
  return { draftId, valid: errors.length === 0, status: errors.length ? 'DRAFT' : 'VALIDATED', capabilityStatus: 'UNVERIFIED' as const, providerValidateOnlyRequired: true, spec: normalized, errors, warnings };
}

export type GoogleCampaignType = 'PERFORMANCE_MAX' | 'SHOPPING' | 'DEMAND_GEN' | 'DISPLAY' | 'APP' | 'LEGACY_VIDEO';
export function validateGoogleCampaignType(draftId: string, campaignType: GoogleCampaignType, evidence: Record<string, any>) {
  if (campaignType === 'LEGACY_VIDEO') return { draftId, campaignType, valid: false, capabilityStatus: 'UNSUPPORTED' as const, status: 'MANUAL', manualHandoffs: [{ id: 'legacy_video', owner: 'operator', reason: 'Legacy VideoAd creation is reporting-only', requiredAction: 'Use Demand Gen or Performance Max for API-managed video', status: 'OPEN' }] };
  const missing: Array<[string, string, string]> = [];
  const need = (condition: any, id: string, reason: string, action: string) => { if (!condition) missing.push([id, reason, action]); };
  need(evidence.metaPausedLifecycleVerified, 'meta_lifecycle', 'Meta paused lifecycle is not yet verified', 'Complete the Meta paused-object lifecycle test first');
  if (campaignType === 'PERFORMANCE_MAX' || campaignType === 'SHOPPING') {
    need(evidence.merchantCenterLinked, 'merchant_center', 'A linked Merchant Center account is required', 'Link Merchant Center');
    need(evidence.feedHealthy, 'feed_diagnostics', 'The product feed is missing or unhealthy', 'Resolve Merchant Center feed diagnostics');
    need(evidence.conversionValueReady, 'conversion_value', 'Value-based bidding is not ready', 'Verify conversion values and currency');
  }
  if (campaignType === 'PERFORMANCE_MAX') {
    need(evidence.assetGroupsReady, 'asset_groups', 'Asset groups are incomplete', 'Supply required asset groups');
    need(evidence.listingFiltersReady, 'listing_filters', 'Listing filters are not explicit', 'Define listing filters');
    need(evidence.assetAutomationExplicit, 'asset_automation', 'Asset automation choice is missing', 'Choose asset automation settings');
  }
  if (campaignType === 'DEMAND_GEN' || campaignType === 'DISPLAY') need(evidence.assetsReady, 'assets', 'Creative assets are incomplete', 'Supply policy-ready assets and destinations');
  if (campaignType === 'APP') {
    need(evidence.appLinked, 'app_link', 'The app/store identity is not linked', 'Link the app and store listing');
    need(evidence.appEventsReady, 'app_events', 'App events are not verified', 'Configure and verify app events');
  }
  return { draftId, campaignType, valid: missing.length === 0, capabilityStatus: 'UNVERIFIED' as const, status: missing.length ? 'BLOCKED' : 'ELIGIBLE_FOR_PROVIDER_VALIDATION', requiresPriorVerification: campaignType === 'PERFORMANCE_MAX' || campaignType === 'SHOPPING' ? 'search_campaigns' : campaignType === 'DEMAND_GEN' ? 'performance_max_or_shopping' : campaignType === 'DISPLAY' ? 'demand_gen' : 'display', manualHandoffs: missing.map(([id, reason, requiredAction]) => ({ id, owner: 'operator', reason, requiredAction, status: 'OPEN' })) };
}

export function assessGA4Readiness(accountId: string, snapshot: Record<string, any>) {
  const checkedAt = new Date().toISOString();
  const values: Array<[string, boolean | undefined, string]> = [
    ['access', snapshot.accessHealthy, 'Selected property access'], ['streams', Array.isArray(snapshot.streams) ? snapshot.streams.length > 0 : undefined, 'Web/app data streams'],
    ['tag', snapshot.tagInstalled, 'Google tag'], ['enhanced_measurement', snapshot.enhancedMeasurement, 'Enhanced measurement'],
    ['key_events', Array.isArray(snapshot.keyEvents) ? snapshot.keyEvents.length > 0 : undefined, 'Key events'], ['google_ads_link', snapshot.googleAdsLinked, 'Google Ads link'],
    ['consent', snapshot.consentConfigured, 'Consent configuration'], ['cross_domain', snapshot.crossDomainReady, 'Cross-domain and referral setup'], ['internal_traffic', snapshot.internalTrafficConfigured, 'Internal traffic filter'],
    ['unwanted_referrals', snapshot.unwantedReferralsConfigured, 'Unwanted referral exclusions'], ['retention', snapshot.dataRetentionConfigured, 'Data retention'], ['attribution_settings', snapshot.attributionSettingsReviewed, 'Attribution settings'],
    ['campaign_identifiers', snapshot.campaignIdentifiersReady, 'UTM, gclid, campaign ID, and event parameters']
  ];
  const checks: ReadinessCheck[] = values.map(([id, value, reason]) => ({ id, reason, status: value === true ? 'READY' : value === false ? 'BLOCKED' : 'UNVERIFIED', verifiedAt: value === true ? checkedAt : null }));
  const manualHandoffs: ManualHandoff[] = [];
  if (snapshot.consentConfigured !== true) manualHandoffs.push({ id: 'consent', owner: 'developer', reason: 'Consent state is missing or unverified', requiredAction: 'Configure and verify consent collection and propagation', status: 'OPEN' });
  if (!snapshot.googleAdsLinked) manualHandoffs.push({ id: 'google_ads_link', owner: 'operator', reason: 'Google Ads link is missing or unverified', requiredAction: 'Create or verify the Google Ads property link', status: 'OPEN' });
  return { provider: 'ga4', propertyId: accountId, currency: snapshot.currency ?? null, timezone: snapshot.timezone ?? null, streams: snapshot.streams ?? [], checks, manualHandoffs,
    ready: Boolean(snapshot.currency && snapshot.timezone && checks.every(check => check.status === 'READY')), checkedAt };
}

export function auditGA4Tracking(accountId: string, evidence: Record<string, any>) {
  const findings: Array<{ id: string; severity: 'WARNING' | 'ERROR'; detail: string }> = [];
  if ((evidence.duplicateConversions ?? 0) > 0) findings.push({ id: 'duplicate_conversions', severity: 'ERROR', detail: `${evidence.duplicateConversions} duplicate conversions detected` });
  if ((evidence.missingUtmRate ?? 0) > 0.1) findings.push({ id: 'missing_utms', severity: 'WARNING', detail: `Missing UTM rate is ${evidence.missingUtmRate}` });
  if (evidence.crossDomainBroken) findings.push({ id: 'cross_domain_sessions', severity: 'ERROR', detail: 'Cross-domain session continuity is broken' });
  if (evidence.missingRevenueCurrency) findings.push({ id: 'revenue_currency', severity: 'ERROR', detail: 'Revenue or currency is missing' });
  if ((evidence.invalidEventParameters ?? 0) > 0) findings.push({ id: 'invalid_event_parameters', severity: 'WARNING', detail: 'Invalid event parameters were observed' });
  if (evidence.consentGap) findings.push({ id: 'consent_gap', severity: 'ERROR', detail: 'Consent configuration has a gap' });
  if ((evidence.staleHours ?? 0) > 24) findings.push({ id: 'stale_tracking', severity: 'ERROR', detail: `Tracking data is ${evidence.staleHours} hours stale` });
  const dataQualityWarnings = [evidence.sampled && 'sampling', evidence.thresholded && 'thresholding', evidence.otherRow && '(other) row', evidence.approximateUsers && 'approximate users'].filter(Boolean);
  const health = findings.some(finding => finding.severity === 'ERROR') ? 'BROKEN' : findings.length || dataQualityWarnings.length ? 'DEGRADED' : 'HEALTHY';
  return { propertyId: accountId, health, recommendationStatus: health === 'BROKEN' || dataQualityWarnings.length ? 'INSUFFICIENT_EVIDENCE' : 'READY', findings, dataQualityWarnings, auditedAt: new Date().toISOString() };
}

export const ga4ReportSpecSchema = z.object({
  type: z.enum(['standard','pivot','realtime','funnel']), dimensions: z.array(z.string()).default([]), metrics: z.array(z.string()).default([]),
  dateRanges: z.array(z.object({ startDate: z.string().min(1), endDate: z.string().min(1) }).strict()).default([]), filters: z.record(z.unknown()).optional(), limit: z.number().int().positive().max(250000).default(250000), request: z.record(z.unknown()).default({})
}).strict().superRefine((spec, context) => {
  if (spec.type === 'realtime' && spec.dateRanges.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dateRanges'], message: 'Realtime reports do not accept date ranges' });
  if (spec.type !== 'realtime' && !spec.dateRanges.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dateRanges'], message: 'A date range is required' });
  if (spec.type !== 'funnel' && !spec.metrics.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics'], message: 'At least one metric is required' });
  if (spec.type === 'pivot' && (!Array.isArray((spec.request as any).pivots) || !(spec.request as any).pivots.length)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['request','pivots'], message: 'Pivot reports require explicit pivots with their own limits' });
  if (spec.type === 'funnel' && !(spec.request as any).funnel) context.addIssue({ code: z.ZodIssueCode.custom, path: ['request','funnel'], message: 'Funnel reports require an explicit v1alpha funnel definition' });
});
export function validateGA4Report(reportId: string, input: unknown) {
  const parsed = ga4ReportSpecSchema.safeParse(input);
  return parsed.success
    ? { reportId, valid: true, spec: parsed.data, requiresMetadata: true, requiresCompatibilityCheck: true, errors: [] }
    : { reportId, valid: false, requiresMetadata: true, requiresCompatibilityCheck: true, errors: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) };
}

export function reconcileMeasurement(input: any) {
  const seen = new Set<string>();
  const campaignIds = new Set([...input.platform, ...input.ga4].map((row: any) => row.campaignId).filter(Boolean));
  const clickIds = new Set([...input.platform, ...input.ga4].flatMap((row: any) => row.clickIds ?? []));
  const unmatched: string[] = [];
  let revenue = 0, orders = 0;
  for (const row of [...input.platform, ...input.ga4]) if (row.currency !== input.currency) throw new Error('Source currency differs from report currency; provide an explicit FX source and date');
  for (const outcome of input.outcomes) {
    if (outcome.currency !== input.currency) throw new Error('Outcome currency differs from report currency; provide an explicit FX source and date');
    const day = outcome.occurredAt.slice(0, 10);
    if (day < input.since || day > input.until) throw new Error(`Outcome ${outcome.externalId} falls outside the reconciliation period`);
    if (seen.has(outcome.externalId)) throw new Error(`Duplicate external outcome: ${outcome.externalId}`);
    seen.add(outcome.externalId);
    if (!(outcome.campaignId && campaignIds.has(outcome.campaignId)) && !(outcome.clickId && clickIds.has(outcome.clickId))) unmatched.push(outcome.externalId);
    if (/purchase|order|revenue/i.test(outcome.outcomeType)) { revenue += outcome.value; orders++; }
  }
  return { source: 'reconciled_inputs', synchronizedAt: new Date().toISOString(), period: { since: input.since, until: input.until }, timezone: input.timezone, currency: input.currency,
    attributionBasis: { platform: 'provider-attributed', ga4: 'GA4-attributed', business: 'deduplicated external outcomes' },
    views: { platform: input.platform, ga4: input.ga4, business: { deduplicatedRevenue: revenue, orders, outcomes: seen.size } },
    matching: { matched: seen.size - unmatched.length, unmatched, confidence: seen.size ? (seen.size - unmatched.length) / seen.size : null, utmKeys: input.alignment.utmKeys },
    dataQualityWarnings: ['Platform and GA4 attribution are not additive business revenue', ...(unmatched.length ? [`${unmatched.length} outcomes could not be matched to supplied campaign/click identifiers`] : [])] };
}

