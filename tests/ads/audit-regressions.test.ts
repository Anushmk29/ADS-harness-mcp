import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdsService } from '../../src/modules/ads/service.js';
import { AdsTransport } from '../../src/modules/ads/transport.js';
import { adsToolMap } from '../../src/modules/ads/tools.js';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('write policy regressions', () => {
  it('rejects numeric activation enums and checks absolute budget schedules', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-policy-'));
    const ads = new AdsService({ storageDir: dir, mode: 'dry-run', accounts: { google: ['123'], meta: ['123'] }, allowedObjects: ['456'], maxBudgetPerWrite: { meta: 100, google: 100 } });
    try {
      for (const status of [2, '2', 'ENABLED', ' enabled ']) {
        await expect(ads.call('google_ads_mutate_campaigns', { accountId: '123', operations: [{ update: { resourceName: 'customers/123/campaigns/456', status }, updateMask: 'status' }] })).rejects.toThrow(/Status|activation/);
      }
      const schedule = { accountId: '123', parentId: '456', data: { budget_value: 100, budget_value_type: 'ABSOLUTE', time_start: '2027-01-01T00:00:00Z', time_end: '2027-01-02T00:00:00Z' } };
      expect((await ads.call('meta_ads_create_budget_schedule', schedule)).status).toBe('DRY_RUN');
      for (const budget_value of [101, 1.5]) await expect(ads.call('meta_ads_create_budget_schedule', { ...schedule, data: { ...schedule.data, budget_value } })).rejects.toThrow(/ceiling|integer/);
      await expect(ads.call('meta_ads_create_budget_schedule', { ...schedule, data: { ...schedule.data, budget_value_type: 'MULTIPLIER' } })).rejects.toThrow('effective amount');
      await expect(ads.call('google_ads_mutate_campaignBudgets', { accountId: '123', operations: [{ update: { resourceName: 'customers/123/campaignBudgets/456', amount_micros: 101 }, updateMask: 'amount_micros' }] })).rejects.toThrow('ceiling');
    } finally { ads.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Google transport regressions', () => {
  it('refreshes expired tokens and shares concurrent refresh requests', async () => {
    vi.stubEnv('ADS_DIRECT_GOOGLE_ACCESS_TOKEN', '');
    vi.stubEnv('ADS_DIRECT_GOOGLE_REFRESH_TOKEN', 'refresh');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    let refreshes = 0;
    const network = vi.fn(async () => new Response(JSON.stringify({ access_token: `token-${++refreshes}`, expires_in: 3600 })));
    const transport = new AdsTransport({ fetch: network });
    expect(await Promise.all([transport.token('google'), transport.token('google')])).toEqual(['token-1', 'token-1']);
    expect(await transport.token('google')).toBe('token-1');
    clock.mockReturnValue(1_000_000 + 3_600_000);
    expect(await Promise.all([transport.token('google'), transport.token('google')])).toEqual(['token-2', 'token-2']);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('retries a failed refresh on the next call', async () => {
    vi.stubEnv('ADS_DIRECT_GA4_ACCESS_TOKEN', '');
    vi.stubEnv('ADS_DIRECT_GA4_REFRESH_TOKEN', 'refresh');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    const network = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(new Response('{"access_token":"new","expires_in":3600}'));
    const transport = new AdsTransport({ fetch: network });
    await expect(transport.token('ga4')).rejects.toThrow('refresh failed');
    expect(await transport.token('ga4')).toBe('new');
  });

  it('uses customer-level action URLs for planning and conversion uploads', async () => {
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN', 'developer');
    const paths: string[] = [];
    const transport = new AdsTransport({ tokens: { google: 'token' }, fetch: async url => { paths.push(new URL(String(url)).pathname); return new Response('{}'); } });
    const cases = {
      google_ads_keyword_ideas: 'generateKeywordIdeas', google_ads_keyword_historical_metrics: 'generateKeywordHistoricalMetrics',
      google_ads_keyword_forecast: 'generateKeywordForecastMetrics', google_ads_upload_click_conversions: 'uploadClickConversions',
      google_ads_upload_conversion_adjustments: 'uploadConversionAdjustments'
    };
    for (const tool of Object.keys(cases)) await transport.dispatch(adsToolMap.get(tool)!, { accountId: '123', data: {} });
    expect(paths).toEqual(Object.values(cases).map(action => `/v25/customers/123:${action}`));
    await transport.dispatch(adsToolMap.get('google_ads_create_customer_match_job')!, { accountId: '123', data: {} });
    expect(paths.at(-1)).toBe('/v25/customers/123/offlineUserDataJobs:create');
  });
});

it('sends minute ranges, not date ranges, for validated realtime reports', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ads-realtime-'));
  const requests: Array<{ url: string; body: any }> = [];
  const ads = new AdsService({ storageDir: dir, tokens: { ga4: 'token' }, fetch: async (url, init) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response('{}');
  } });
  try {
    await ads.call('ga4_run_validated_report', { reportId: 'realtime', accountId: '123', timezone: 'Asia/Kolkata', currency: 'INR', spec: { type: 'realtime', metrics: ['activeUsers'], request: { minuteRanges: [{ startMinutesAgo: 5, endMinutesAgo: 0 }], dateRanges: [{ startDate: 'bad', endDate: 'bad' }] } } });
    const body = requests.find(request => request.url.endsWith(':runRealtimeReport'))!.body;
    expect(body).not.toHaveProperty('dateRanges');
    expect(body.minuteRanges).toEqual([{ startMinutesAgo: 5, endMinutesAgo: 0 }]);
    expect(body.metrics).toEqual([{ name: 'activeUsers' }]);
  } finally { ads.close(); rmSync(dir, { recursive: true, force: true }); }
});
