import { validateGoogleSearchCampaign, validateMetaCampaign } from './contracts.js';

export function prepareMetaLaunch(launchId: string, accountId: string, input: unknown) {
  const validation: any = validateMetaCampaign(launchId, input);
  if (!validation.valid) return validation;
  const { campaign, adSet, ad } = validation.spec;
  const campaignPayload: Record<string, any> = { name: campaign.name, objective: campaign.objective, status: 'PAUSED', special_ad_categories: [], bid_strategy: campaign.bidStrategy };
  if (campaign.budgetOwner === 'CAMPAIGN') {
    if (campaign.dailyBudget) campaignPayload.daily_budget = campaign.dailyBudget;
    if (campaign.lifetimeBudget) campaignPayload.lifetime_budget = campaign.lifetimeBudget;
  }
  const placementMap: Record<string, [string, string]> = { facebook_feed: ['facebook','feed'], instagram_feed: ['instagram','stream'], instagram_stories: ['instagram','story'], instagram_reels: ['instagram','reels'], facebook_reels: ['facebook','facebook_reels'] };
  const mapped: Array<[string, string]> = (adSet.placements as string[]).map(placement => placementMap[placement]).filter((value): value is [string, string] => Boolean(value));
  const targeting: Record<string, any> = { ...adSet.targeting };
  if (mapped.length) {
    const publishers = [...new Set(mapped.map(([publisher]) => publisher))];
    targeting.publisher_platforms = publishers;
    for (const publisher of publishers) targeting[`${publisher}_positions`] = [...new Set(mapped.filter(([value]) => value === publisher).map(([, position]) => position))];
  }
  const adSetPayload: Record<string, any> = { name: adSet.name, optimization_goal: adSet.performanceGoal, billing_event: adSet.billingEvent, destination_type: adSet.conversionLocation, targeting, status: 'PAUSED' };
  if (campaign.budgetOwner === 'AD_SET') {
    if (campaign.dailyBudget) adSetPayload.daily_budget = campaign.dailyBudget;
    if (campaign.lifetimeBudget) adSetPayload.lifetime_budget = campaign.lifetimeBudget;
  }
  if (adSet.datasetId) adSetPayload.promoted_object = { ...(adSet.promotedObject ?? {}), pixel_id: adSet.datasetId };
  if (adSet.appId) adSetPayload.promoted_object = { ...(adSet.promotedObject ?? {}), application_id: adSet.appId };
  if (adSet.attributionWindows.length) adSetPayload.attribution_spec = adSet.attributionWindows.map((value: string) => { const [days, view] = value.split('_'); return { event_type: view === 'view' ? 'VIEW_THROUGH' : 'CLICK_THROUGH', window_days: Number(days.replace('d','')) }; });
  const callToAction = { type: ad.callToAction, value: { ...(ad.destinationUrl ? { link: ad.destinationUrl } : {}), ...(ad.leadFormId ? { lead_gen_form_id: ad.leadFormId } : {}) } };
  const creativePayload = ad.creative.existingPostId
    ? { name: `${ad.name} creative`, object_story_id: ad.creative.existingPostId }
    : { name: `${ad.name} creative`, ...(ad.instagramActorId ? { instagram_actor_id: ad.instagramActorId } : {}), ...(Object.keys(ad.urlParameters).length ? { url_tags: new URLSearchParams(ad.urlParameters).toString() } : {}), object_story_spec: { page_id: ad.pageId, link_data: ad.creative.imageHash ? { image_hash: ad.creative.imageHash, link: ad.destinationUrl, message: ad.primaryText, name: ad.headline, description: ad.description, call_to_action: callToAction } : undefined, video_data: ad.creative.videoId ? { video_id: ad.creative.videoId, message: ad.primaryText, title: ad.headline, call_to_action: callToAction } : undefined } };
  return {
    ...validation, launchId, accountId,
    payload: { campaign: campaignPayload, adset: adSetPayload, creative: creativePayload, ad: { name: ad.name, status: 'PAUSED' } }, localBudgetSchedules: campaign.budgetSchedules,
    approvalBrief: { provider: 'meta', accountId, objective: campaign.objective, audience: adSet.targeting, placements: adSet.placements, creative: ad.creative, destination: ad.destinationUrl ?? adSet.conversionLocation, conversionGoal: adSet.performanceGoal, budget: campaign.dailyBudget ?? campaign.lifetimeBudget ?? null, bidStrategy: campaign.bidStrategy, warnings: validation.warnings, exactOperations: [`${launchId}-campaign`,`${launchId}-adset`,`${launchId}-creative`,`${launchId}-ad`], expectedOutcome: 'Create and verify a paused Meta hierarchy', activationRequiresSeparateApproval: true }
  };
}

export function prepareGoogleSearchLaunch(launchId: string, accountId: string, input: unknown, metaPausedLifecycleVerified = false) {
  if (!metaPausedLifecycleVerified) return { launchId, accountId, valid: false, status: 'BLOCKED', errors: ['Meta paused lifecycle must be verified before Google campaign creation'] };
  const validation: any = validateGoogleSearchCampaign(launchId, input);
  if (!validation.valid) return validation;
  const { campaign, adGroups } = validation.spec;
  const steps: any[] = [
    { operationId: `${launchId}-budget`, resource: 'campaignBudgets', validateOnly: true, payload: { name: `${campaign.name} budget`, amountMicros: campaign.budgetMicros } },
    { operationId: `${launchId}-campaign`, resource: 'campaigns', validateOnly: true, payload: { ...campaign, status: 'PAUSED' } }
  ];
  for (const [index, adGroup] of adGroups.entries()) {
    steps.push({ operationId: `${launchId}-adgroup-${index}`, resource: 'adGroups', validateOnly: true, payload: { name: adGroup.name, status: 'PAUSED' } });
    for (const [keywordIndex, keyword] of adGroup.keywords.entries()) steps.push({ operationId: `${launchId}-keyword-${index}-${keywordIndex}`, resource: 'adGroupCriteria', validateOnly: true, payload: { keyword } });
    steps.push({ operationId: `${launchId}-rsa-${index}`, resource: 'adGroupAds', validateOnly: true, payload: { ...adGroup.responsiveSearchAd, status: 'PAUSED' } });
  }
  return { ...validation, launchId, accountId, rolloutGate: 'META_PAUSED_LIFECYCLE_VERIFIED', steps, approvalBrief: { provider: 'google', accountId, objective: 'SEARCH', audience: { locations: campaign.locations, languages: campaign.languages }, placements: campaign.networks, creative: adGroups.map((group: any) => group.responsiveSearchAd), destination: adGroups.flatMap((group: any) => group.responsiveSearchAd.finalUrls), conversionGoal: campaign.conversionGoals, schedule: { startDate: campaign.startDate, endDate: campaign.endDate, adSchedule: campaign.adSchedule }, budget: campaign.budgetMicros, bidStrategy: campaign.biddingStrategy, warnings: validation.warnings, exactOperations: steps.map(step => step.operationId), expectedOutcome: 'Validate, create, and verify a paused Google Search hierarchy', activationRequiresSeparateApproval: true } };
}

export const googleReportTemplates = {
  account_performance: { query: 'SELECT customer.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer' },
  campaign_performance: { query: 'SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign' },
  ad_group_performance: { query: 'SELECT campaign.id, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group' },
  ad_performance: { query: 'SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad' },
  asset_performance: { query: 'SELECT campaign.id, ad_group.id, asset.id, asset.name, ad_group_ad_asset_view.field_type, ad_group_ad_asset_view.performance_label, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad_asset_view' },
  keyword_performance: { query: 'SELECT campaign.id, ad_group.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view' },
  search_terms: { query: 'SELECT campaign.id, ad_group.id, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view' },
  budget_pacing: { query: 'SELECT campaign.id, campaign.name, campaign_budget.id, campaign_budget.amount_micros, campaign_budget.total_amount_micros, metrics.cost_micros FROM campaign' },
  impression_share_quality: { query: 'SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.quality_info.quality_score, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM keyword_view' },
  policy_and_learning: { query: 'SELECT campaign.id, campaign.name, campaign.primary_status, campaign.primary_status_reasons, campaign.bidding_strategy_system_status FROM campaign' },
  conversion_actions: { query: 'SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type FROM conversion_action' },
  change_history: { query: 'SELECT change_event.change_date_time, change_event.change_resource_type, change_event.user_email, change_event.changed_fields FROM change_event' },
  experiments: { query: 'SELECT experiment.id, experiment.name, experiment.status, experiment.start_date, experiment.end_date FROM experiment' }
};

export const ga4ReportTemplates = {
  landing_pages: { dimensions: ['landingPage'], metrics: ['sessions','engagedSessions','keyEvents'] },
  source_medium: { dimensions: ['sessionSourceMedium'], metrics: ['sessions','keyEvents','totalRevenue'] },
  default_channel_group: { dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions','keyEvents','totalRevenue'] },
  campaigns: { dimensions: ['sessionCampaignId','sessionCampaignName'], metrics: ['sessions','keyEvents','totalRevenue'] },
  events: { dimensions: ['eventName'], metrics: ['eventCount','keyEvents'] },
  ecommerce_revenue: { dimensions: ['transactionId'], metrics: ['purchaseRevenue','ecommercePurchases'] },
  lead_funnel: { dimensions: ['eventName'], metrics: ['eventCount','keyEvents'] },
  user_acquisition: { dimensions: ['firstUserDefaultChannelGroup'], metrics: ['newUsers','keyEvents'] },
  traffic_acquisition: { dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions','keyEvents'] },
  device_geography: { dimensions: ['deviceCategory','country'], metrics: ['sessions','keyEvents'] },
  realtime_health: { dimensions: ['eventName'], metrics: ['eventCount'] }
};

