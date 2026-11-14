import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdsService } from '../../src/modules/ads/service.js';
import { DepartmentJobs } from '../../src/departments/jobs.js';

describe('ads planning contracts', () => {
  it('exposes persisted provider versions and explicit capability statuses', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-manifests-'));
    let service = new AdsService({ storageDir: dir });
    try {
      const first = await service.call('ads_provider_versions', {});
      expect(first.status).toBe('COMPLETED');
      expect(first.data.map((manifest: any) => manifest.provider)).toEqual(['meta', 'google', 'ga4']);
      expect(first.data.find((manifest: any) => manifest.provider === 'meta')).toMatchObject({ apiVersion: 'v26.0' });
      expect(first.data.find((manifest: any) => manifest.provider === 'google')).toMatchObject({ apiVersion: 'v25' });
      expect(first.data.flatMap((manifest: any) => manifest.capabilities).every((capability: any) =>
        ['SUPPORTED', 'MANUAL', 'UNVERIFIED', 'DEPRECATED', 'UNSUPPORTED'].includes(capability.status))).toBe(true);

      service.close();
      service = new AdsService({ storageDir: dir });
      expect((await service.call('ads_provider_versions', {})).data).toEqual(first.data);
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('fails Meta readiness closed and returns explicit manual handoffs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meta-readiness-'));
    const service = new AdsService({ storageDir: dir });
    try {
      const result = await service.call('meta_ads_readiness', { accountId: '123', snapshot: { currency: 'INR', timezone: 'Asia/Kolkata' } });
      expect(result.status).toBe('COMPLETED');
      expect(result.data.ready).toBe(false);
      expect(result.data.checks.find((check: any) => check.id === 'ads_management')).toMatchObject({ status: 'UNVERIFIED' });
      expect(result.data.manualHandoffs.map((handoff: any) => handoff.id)).toContain('payment_method');
      expect(result.data).toMatchObject({ accountId: '123', currency: 'INR', timezone: 'Asia/Kolkata' });
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('validates a typed paused Meta campaign and rejects incompatible or prohibited inputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meta-validation-'));
    const service = new AdsService({ storageDir: dir });
    const base = {
      campaign: { name: 'Lead campaign', objective: 'OUTCOME_LEADS', budgetOwner: 'AD_SET', bidStrategy: 'LOWEST_COST_WITHOUT_CAP', specialAdCategories: [] },
      adSet: { name: 'Lead set', conversionLocation: 'INSTANT_FORM', performanceGoal: 'LEAD_GENERATION', billingEvent: 'IMPRESSIONS', targeting: { countries: ['IN'] }, placements: ['facebook_feed'] },
      ad: { name: 'Lead ad', pageId: '999', leadFormId: '777', creative: { existingPostId: '888' }, primaryText: 'Request a consultation', callToAction: 'LEARN_MORE' }
    };
    try {
      const valid = await service.call('meta_ads_validate_campaign', { draftId: 'meta-lead', spec: base });
      expect(valid.data).toMatchObject({ valid: true, draftId: 'meta-lead', capabilityStatus: 'UNVERIFIED', predictedAdvantageState: false });
      expect(valid.data.spec.campaign).toMatchObject({ status: 'PAUSED', specialAdCategories: [] });
      expect(valid.data.spec.adSet.status).toBe('PAUSED');
      expect(valid.data.spec.ad.status).toBe('PAUSED');

      const incompatible = await service.call('meta_ads_validate_campaign', { draftId: 'meta-bad-combo', spec: { ...base, adSet: { ...base.adSet, conversionLocation: 'APP' } } });
      expect(incompatible.data.valid).toBe(false);
      expect(incompatible.data.errors.join(' ')).toContain('objective + conversion location + performance goal');

      const prohibited = await service.call('meta_ads_validate_campaign', { draftId: 'meta-prohibited', spec: { ...base, campaign: { ...base.campaign, specialAdCategories: ['HOUSING'] }, adSet: { ...base.adSet, placements: ['messenger_stories'] } } });
      expect(prohibited.data.valid).toBe(false);
      expect(prohibited.data.errors.join(' ')).toContain('special-ad categories');
      expect(prohibited.data.errors.join(' ')).toContain('placement');

      const sales = await service.call('meta_ads_validate_campaign', { draftId: 'meta-sales', spec: { ...base, campaign: { ...base.campaign, objective: 'OUTCOME_SALES' }, adSet: { ...base.adSet, conversionLocation: 'WEBSITE', performanceGoal: 'VALUE', datasetId: '55', purchaseValueSource: true }, ad: { ...base.ad, destinationUrl: 'https://example.com/buy' } } });
      expect(sales.data.valid).toBe(false);
      expect(sales.data.errors.join(' ')).toContain('purchase event');
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('assesses Google readiness and validates a paused Search hierarchy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'google-planning-'));
    const service = new AdsService({ storageDir: dir });
    const spec = {
      campaign: { name: 'Search', budgetMicros: 5_000_000, biddingStrategy: 'MAXIMIZE_CONVERSIONS', networks: ['GOOGLE_SEARCH'], locations: ['2356'], languages: ['1000'], conversionGoals: ['lead'] },
      adGroups: [{ name: 'Automation', keywords: [{ text: 'marketing automation', matchType: 'PHRASE' }], negativeKeywords: ['free'], responsiveSearchAd: { headlines: ['Automate Marketing', 'Verified Campaign Setup', 'Request A Consultation'], descriptions: ['Build controlled campaigns with explicit approval.', 'Connect measurement before scaling spend.'], finalUrls: ['https://example.com/ads'] } }]
    };
    try {
      const readiness = await service.call('google_ads_readiness', { accountId: '123', snapshot: { currency: 'INR', timezone: 'Asia/Kolkata', developerTokenAccess: 'TEST' } });
      expect(readiness.data.ready).toBe(false);
      expect(readiness.data.manualHandoffs.map((handoff: any) => handoff.id)).toContain('billing');

      const valid = await service.call('google_ads_validate_search_campaign', { draftId: 'google-search', spec });
      expect(valid.data).toMatchObject({ valid: true, providerValidateOnlyRequired: true, capabilityStatus: 'UNVERIFIED' });
      expect(valid.data.spec.campaign.status).toBe('PAUSED');
      expect(valid.data.spec.adGroups[0].responsiveSearchAd.status).toBe('PAUSED');

      const invalid = await service.call('google_ads_validate_search_campaign', { draftId: 'google-invalid', spec: { ...spec, adGroups: [{ ...spec.adGroups[0], responsiveSearchAd: { ...spec.adGroups[0].responsiveSearchAd, headlines: ['This headline is substantially longer than thirty characters', 'Two', 'Three'] } }] } });
      expect(invalid.data.valid).toBe(false);
      expect(invalid.data.errors.join(' ')).toContain('30');

      const broadClicks = await service.call('google_ads_validate_search_campaign', { draftId: 'google-broad', spec: { campaign: { ...spec.campaign, biddingStrategy: 'MAXIMIZE_CLICKS' }, adGroups: [{ ...spec.adGroups[0], negativeKeywords: [], keywords: [{ text: 'marketing automation', matchType: 'BROAD' }] }] } });
      expect(broadClicks.data.valid).toBe(false);
      expect(broadClicks.data.errors.join(' ')).toContain('Smart Bidding');
      expect(broadClicks.data.warnings.join(' ')).toContain('negative keywords');
      const broadSmart = await service.call('google_ads_validate_search_campaign', { draftId: 'google-broad-smart', spec: { ...spec, adGroups: [{ ...spec.adGroups[0], keywords: [{ text: 'marketing automation', matchType: 'BROAD' }] }] } });
      expect(broadSmart.data.valid).toBe(true);

      const pmax = await service.call('google_ads_validate_campaign_type', { draftId: 'pmax', campaignType: 'PERFORMANCE_MAX', evidence: { merchantCenterLinked: false } });
      expect(pmax.data).toMatchObject({ valid: false, capabilityStatus: 'UNVERIFIED' });
      expect(pmax.data.manualHandoffs.map((handoff: any) => handoff.id)).toContain('merchant_center');
      const video = await service.call('google_ads_validate_campaign_type', { draftId: 'video', campaignType: 'LEGACY_VIDEO', evidence: {} });
      expect(video.data).toMatchObject({ valid: false, capabilityStatus: 'UNSUPPORTED' });
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('assesses GA4 tracking, validates reports, and keeps attribution views separate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ga4-planning-'));
    const service = new AdsService({ storageDir: dir });
    try {
      const readiness = await service.call('ga4_readiness', { accountId: '123', snapshot: { currency: 'INR', timezone: 'Asia/Kolkata', streams: ['web'], tagInstalled: true, enhancedMeasurement: true, keyEvents: ['purchase'] } });
      expect(readiness.data.ready).toBe(false);
      expect(readiness.data.checks.find((check: any) => check.id === 'consent')).toMatchObject({ status: 'UNVERIFIED' });

      const audit = await service.call('ga4_tracking_audit', { accountId: '123', evidence: { duplicateConversions: 2, missingUtmRate: 0.3, staleHours: 30, thresholded: true } });
      expect(audit.data).toMatchObject({ health: 'BROKEN', recommendationStatus: 'INSUFFICIENT_EVIDENCE' });
      expect(audit.data.findings.map((finding: any) => finding.id)).toContain('duplicate_conversions');

      const report = await service.call('ga4_validate_report', { reportId: 'landing-pages', spec: { type: 'standard', dimensions: ['landingPage'], metrics: ['sessions','keyEvents'], dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }], limit: 250000 } });
      expect(report.data).toMatchObject({ valid: true, requiresCompatibilityCheck: true });

      const reconciled = await service.call('ads_reconcile_measurement', { currency: 'INR', since: '2026-09-01', until: '2026-09-30', timezone: 'Asia/Kolkata', alignment: { campaignIds: true, utmKeys: ['utm_source','utm_campaign'], conversionDefinitions: true, currencies: true }, platform: [{ provider: 'meta', currency: 'INR', spend: 100, attributedRevenue: 900 }, { provider: 'google', currency: 'INR', spend: 200, attributedRevenue: 1100 }], ga4: [{ campaignId: 'c1', currency: 'INR', attributedRevenue: 700 }], outcomes: [{ externalId: 'o1', occurredAt: '2026-09-10T10:00:00Z', outcomeType: 'purchase', value: 1000, currency: 'INR', campaignId: 'c1' }] });
      expect(reconciled.data.views.platform.map((row: any) => row.attributedRevenue)).toEqual([900, 1100]);
      expect(reconciled.data.views.ga4[0].attributedRevenue).toBe(700);
      expect(reconciled.data.views.business).toMatchObject({ deduplicatedRevenue: 1000, orders: 1 });
      expect(reconciled.data.views.business).not.toHaveProperty('attributedRevenue');
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('prepares deterministic paused Meta and Google launch plans with approval briefs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'launch-plans-'));
    const service = new AdsService({ storageDir: dir });
    const meta = {
      campaign: { name: 'Traffic', objective: 'OUTCOME_TRAFFIC', budgetOwner: 'AD_SET', bidStrategy: 'LOWEST_COST_WITHOUT_CAP', specialAdCategories: [] },
      adSet: { name: 'Visitors', conversionLocation: 'WEBSITE', performanceGoal: 'LANDING_PAGE_VIEWS', billingEvent: 'IMPRESSIONS', targeting: { countries: ['IN'] }, placements: ['facebook_feed'] },
      ad: { name: 'Traffic ad', pageId: '999', creative: { imageHash: 'hash' }, destinationUrl: 'https://example.com/offer', primaryText: 'See the offer', headline: 'Learn More', callToAction: 'LEARN_MORE' }
    };
    const google = {
      campaign: { name: 'Search', budgetMicros: 5_000_000, biddingStrategy: 'MAXIMIZE_CONVERSIONS', networks: ['GOOGLE_SEARCH'], locations: ['2356'], languages: ['1000'], conversionGoals: ['lead'] },
      adGroups: [{ name: 'Automation', keywords: [{ text: 'marketing automation', matchType: 'PHRASE' }], negativeKeywords: [], responsiveSearchAd: { headlines: ['Automate Marketing', 'Verified Campaign Setup', 'Request A Consultation'], descriptions: ['Build campaigns with explicit approval.', 'Connect measurement before scaling.'], finalUrls: ['https://example.com/ads'] } }]
    };
    try {
      const metaPlan = await service.call('meta_ads_prepare_launch', { launchId: 'meta-plan', accountId: '123', spec: meta });
      expect(metaPlan.data.valid).toBe(true);
      expect(metaPlan.data.payload.campaign).toMatchObject({ status: 'PAUSED', special_ad_categories: [] });
      expect(metaPlan.data.approvalBrief).toMatchObject({ provider: 'meta', accountId: '123', activationRequiresSeparateApproval: true });

      const googlePlan = await service.call('google_ads_prepare_search_launch', { launchId: 'google-plan', accountId: '456', spec: google });
      expect(googlePlan.data).toMatchObject({ valid: false, status: 'BLOCKED' });
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('exposes report templates and persists evidence-backed recommendations and monitoring schedules', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-records-'));
    const service = new AdsService({ storageDir: dir });
    try {
      const google = await service.call('google_ads_report_templates', {});
      expect(google.data.search_terms.query).toContain('ad_group.id');
      const ga4 = await service.call('ga4_report_templates', {});
      expect(Object.keys(ga4.data)).toEqual(expect.arrayContaining(['landing_pages','campaigns','ecommerce_revenue','realtime_health']));

      const recommendation = await service.call('ads_create_recommendation', { recommendationId: 'rec-1', provider: 'google', accountId: '123', action: 'add_negative_keywords', evidencePeriod: { since: '2026-09-01', until: '2026-09-28' }, timezone: 'Asia/Kolkata', currency: 'INR', dataQualityWarnings: [], conversionLag: '7 days', minimumDataStatus: 'MET', expectedResult: 'Reduce irrelevant spend', confidence: 0.8, cooldownDays: 14, evaluationDate: '2026-10-13', stopCondition: 'CPA increases by 20%', proposedOperations: [{ term: 'free' }] });
      expect(recommendation.data).toMatchObject({ status: 'DRAFT', approvalRequired: true, automatedExecution: false });
      const schedule = await service.call('ads_schedule_monitoring', { scheduleId: 'daily-meta', provider: 'meta', accountId: '123', timezone: 'Asia/Kolkata', currency: 'INR' });
      expect(schedule.data).toMatchObject({ localTime: '08:00', cadence: 'DAILY', baselineDays: 90, status: 'ACTIVE', jobs: ['daily-meta-baseline','daily-meta-daily'] });
      const jobs = new DepartmentJobs(join(dir, 'jobs'));
      expect(jobs.list().map((job: any) => job.id)).toEqual(['daily-meta-baseline','daily-meta-daily']);
      jobs.close();
      const records = await service.call('ads_list_records', { kind: 'recommendation' });
      expect(records.data).toHaveLength(1);
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('checks GA4 metadata and compatibility before persisting a dynamic report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ga4-validated-report-'));
    const responses = [
      new Response('{"error":{"message":"quota"}}', { status: 429, headers: { 'Retry-After': '0' } }),
      new Response('{"dimensions":[{"apiName":"country"}],"metrics":[{"apiName":"sessions"}]}'),
      new Response('{"dimensionCompatibilities":[{"dimensionMetadata":{"apiName":"country"},"compatibility":"COMPATIBLE"}],"metricCompatibilities":[{"metricMetadata":{"apiName":"sessions"},"compatibility":"COMPATIBLE"}]}'),
      new Response('{"rows":[],"rowCount":0,"metadata":{},"propertyQuota":{"tokensPerDay":{"remaining":100}}}')
    ];
    const network = vi.fn(async () => responses.shift()!);
    const service = new AdsService({ storageDir: dir, tokens: { ga4: 'test' }, fetch: network });
    try {
      const result = await service.call('ga4_run_validated_report', {
        reportId: 'country-sessions', accountId: '123', timezone: 'Asia/Calcutta', currency: 'INR',
        spec: { type: 'standard', dimensions: ['country'], metrics: ['sessions'], dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }] }
      });
      expect(result.status).toBe('COMPLETED');
      expect(result.data.report._metadata).toMatchObject({ source: 'ga4', timezone: 'Asia/Calcutta', currency: 'INR' });
      expect(network).toHaveBeenCalledTimes(4);
      expect((await service.call('ads_list_records', { kind: 'report' })).data).toHaveLength(1);
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
