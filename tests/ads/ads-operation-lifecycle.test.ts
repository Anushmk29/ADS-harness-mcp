import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdsService } from '../../src/modules/ads/service.js';
import { AdsState } from '../../src/modules/ads/state.js';

describe('ads operation lifecycle', () => {
  it('never dispatches writes while the provider is off', async () => {
    const network = vi.fn();
    const service = new AdsService({ mode: 'off', accounts: { meta: ['123'] }, fetch: network });
    try {
      const result = await service.call('meta_ads_create_campaign', {
        accountId: '123',
        operationId: 'off-campaign',
        data: { name: 'Off', objective: 'OUTCOME_AWARENESS' }
      });
      expect(result).toMatchObject({ status: 'OFF', dispatched: false });
      expect(network).not.toHaveBeenCalled();
    } finally { service.close(); }
  });

  it('keeps reads account-scoped and rejects deprecated Meta values before dispatch', async () => {
    const network = vi.fn();
    const service = new AdsService({ mode: 'dry-run', accounts: { meta: ['123'] }, fetch: network });
    try {
      await expect(service.call('meta_ads_insights', { accountId: '456', since: '2026-09-01', until: '2026-09-02' })).rejects.toThrow('allowlist');
      await expect(service.call('meta_ads_update_adset', { accountId: '123', operationId: 'deprecated', objectId: '99', data: { placements: ['messenger_stories'] } })).rejects.toThrow('deprecated');
      expect(network).not.toHaveBeenCalled();
    } finally { service.close(); }
  });

  it('downgrades legacy autonomous mode to exact-payload approval', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-legacy-mode-'));
    const network = vi.fn(async () => new Response('{"id":"456"}'));
    const service = new AdsService({ mode: 'autonomous', accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'test' }, fetch: network });
    try {
      const pending = await service.call('meta_ads_create_campaign', {
        accountId: '123',
        operationId: 'legacy-campaign',
        data: { name: 'Legacy', objective: 'OUTCOME_TRAFFIC' }
      });
      expect(pending.status).toBe('PENDING_APPROVAL');
      expect(network).not.toHaveBeenCalled();
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('binds approval to the paused provider payload and records every transition', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-lifecycle-'));
    const network = vi.fn(async () => new Response('{"id":"789"}'));
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'test' }, fetch: network });
    try {
      const pending = await service.call('meta_ads_create_campaign', {
        accountId: '123',
        operationId: 'approved-campaign',
        data: { name: 'Approved', objective: 'OUTCOME_LEADS', status: 'ACTIVE' }
      });
      expect(pending).toMatchObject({
        status: 'PENDING_APPROVAL',
        binding: { provider: 'meta', accountId: '123', operationId: 'approved-campaign', object: 'campaigns' }
      });
      expect(pending.transitions.map((event: any) => event.status)).toEqual(['DRAFT', 'PENDING_APPROVAL']);

      const authorized = service.decide('approved-campaign', true);
      expect(authorized.status).toBe('AUTHORIZED');
      expect(authorized.approval).toMatchObject({ approved: true, ...pending.binding });

      const accepted = await service.resume('approved-campaign');
      expect(accepted.status).toBe('DISPATCHED');
      expect(accepted.transitions.map((event: any) => event.status)).toEqual([
        'DRAFT', 'PENDING_APPROVAL', 'AUTHORIZED', 'DISPATCHED'
      ]);
      expect(new URLSearchParams((network.mock.calls[0] as any)[1].body).get('status')).toBe('PAUSED');
      expect(network).toHaveBeenCalledTimes(1);
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('forces Google campaign and ad creation to paused before approval', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-google-paused-'));
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN', 'test');
    const bodies: any[] = [];
    const network = vi.fn(async (_url: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response('{"results":[{}]}');
    });
    const state = new AdsState(dir); state.save('rollout_gate', 'meta_paused_lifecycle', { verifiedAt: new Date().toISOString() }); state.save('google_readiness', '123', { ready: true }); state.close();
    const service = new AdsService({ mode: 'live-with-approval', accounts: { google: ['123'] }, verifiedAccounts: { google: ['123'] }, storageDir: dir, tokens: { google: 'test' }, fetch: network });
    try {
      for (const [tool, operationId] of [['google_ads_mutate_campaigns', 'google-campaign'], ['google_ads_mutate_adGroups', 'google-ad-group'], ['google_ads_mutate_adGroupAds', 'google-ad']] as const) {
        const resource = ({ google_ads_mutate_campaigns: 'campaigns', google_ads_mutate_adGroups: 'adGroups', google_ads_mutate_adGroupAds: 'adGroupAds' } as const)[tool];
        await service.call('google_ads_validate_operations', { accountId: '123', resource, operations: [{ create: { name: operationId, status: 'ENABLED' } }] });
        const pending = await service.call(tool, { accountId: '123', operationId, operations: [{ create: { name: operationId, status: 'ENABLED' } }] });
        expect(pending.args.operations[0].create.status).toBe('PAUSED');
        service.decide(operationId, true);
        expect((await service.resume(operationId)).status).toBe('DISPATCHED');
      }
      expect(bodies.filter(body => !body.validateOnly).map(body => body.operations[0].create.status)).toEqual(['PAUSED', 'PAUSED', 'PAUSED']);
    } finally { service.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not mark a concurrently dispatched operation uncertain while its lease is active', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-dispatch-lease-'));
    let release!: () => void;
    const response = new Promise<void>(resolve => { release = resolve; });
    const network = vi.fn(async () => { await response; return new Response('{"id":"456"}'); });
    const options = { mode: 'live-with-approval' as const, accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'test' }, fetch: network };
    const first = new AdsService(options), second = new AdsService(options);
    try {
      await first.call('meta_ads_create_campaign', { accountId: '123', operationId: 'leased-create', data: { name: 'Leased', objective: 'OUTCOME_AWARENESS' } });
      first.decide('leased-create', true);
      vi.useFakeTimers();
      const dispatch = first.resume('leased-create');
      await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(80_000);
      expect((await second.resume('leased-create')).status).toBe('DISPATCHED');
      release();
      expect((await dispatch).status).toBe('DISPATCHED');
    } finally { release(); vi.useRealTimers(); first.close(); second.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('fails missing credentials before marking an operation dispatched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-preflight-'));
    vi.stubEnv('ADS_DIRECT_META_ACCESS_TOKEN', '');
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, storageDir: dir });
    try {
      await service.call('meta_ads_create_campaign', { accountId: '123', operationId: 'missing-token', data: { name: 'No token', objective: 'OUTCOME_AWARENESS' } });
      service.decide('missing-token', true);
      const result = await service.resume('missing-token');
      expect(result.status).toBe('FAILED');
      expect(result.transitions.map((event: any) => event.status)).toEqual(['DRAFT', 'PENDING_APPROVAL', 'AUTHORIZED', 'FAILED']);
    } finally { service.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not let a stale preflight failure overwrite another worker dispatch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-preflight-race-'));
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN', 'test');
    vi.stubEnv('ADS_DIRECT_GOOGLE_REFRESH_TOKEN', 'refresh');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    let failPreflight!: () => void, finishDispatch!: () => void;
    const preflightResponse = new Promise<void>(resolve => { failPreflight = resolve; });
    const dispatchResponse = new Promise<void>(resolve => { finishDispatch = resolve; });
    const staleNetwork = vi.fn(async () => { await preflightResponse; return new Response('', { status: 401 }); });
    let liveCalls = 0;
    const liveNetwork = vi.fn(async () => { if (++liveCalls === 1) return new Response('{}'); await dispatchResponse; return new Response('{"results":[{}]}'); });
    const state = new AdsState(dir); state.save('rollout_gate', 'meta_paused_lifecycle', { verifiedAt: new Date().toISOString() }); state.save('google_readiness', '123', { ready: true }); state.close();
    const base = { mode: 'live-with-approval' as const, accounts: { google: ['123'] }, verifiedAccounts: { google: ['123'] }, storageDir: dir };
    const stale = new AdsService({ ...base, fetch: staleNetwork });
    const live = new AdsService({ ...base, tokens: { google: 'test' }, fetch: liveNetwork });
    try {
      const input = { accountId: '123', operationId: 'preflight-race', operations: [{ create: { name: 'Race' } }] };
      await live.call('google_ads_validate_operations', { accountId: '123', resource: 'campaigns', operations: input.operations });
      await live.call('google_ads_mutate_campaigns', input);
      live.decide('preflight-race', true);
      const staleResume = stale.resume('preflight-race');
      await vi.waitFor(() => expect(staleNetwork).toHaveBeenCalledTimes(1));
      const liveResume = live.resume('preflight-race');
      await vi.waitFor(() => expect(liveNetwork).toHaveBeenCalledTimes(2));
      failPreflight();
      expect((await staleResume).status).toBe('DISPATCHED');
      finishDispatch();
      expect((await liveResume).status).toBe('DISPATCHED');
    } finally { stale.close(); live.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('validates Google mutations without creating an approval or changing provider state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-google-validation-'));
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN', 'test');
    const network = vi.fn(async (_url: any, init: any) => {
      expect(JSON.parse(init.body)).toMatchObject({ validateOnly: true, partialFailure: false });
      return new Response('{}');
    });
    const service = new AdsService({ mode: 'live-with-approval', storageDir: dir, tokens: { google: 'test' }, fetch: network });
    try {
      const result = await service.call('google_ads_validate_operations', {
        accountId: '123', resource: 'campaigns', operations: [{ create: { name: 'Paused', status: 'PAUSED' } }]
      });
      expect(result).toMatchObject({ status: 'COMPLETED', validated: true });
      expect(network).toHaveBeenCalledTimes(1);
    } finally { service.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('polls an accepted Google operation and resolves the journal without redispatching it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-google-operation-'));
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN', 'test');
    const responses = [
      new Response('{"name":"customers/123/operations/456","done":false}'),
      new Response('{"name":"customers/123/operations/456","done":true,"response":{"result":"ok"}}')
    ];
    const network = vi.fn(async () => responses.shift()!);
    const service = new AdsService({ mode: 'live-with-approval', accounts: { google: ['123'] }, storageDir: dir, tokens: { google: 'test' }, fetch: network });
    try {
      await service.call('google_ads_schedule_experiment', { accountId: '123', operationId: 'async-op', objectId: '99', data: {} });
      service.decide('async-op', true);
      expect((await service.resume('async-op')).status).toBe('DISPATCHED');
      const verified = await service.call('google_ads_verify_operation', { operationId: 'async-op' });
      expect(verified).toMatchObject({ status: 'VERIFIED', result: { done: true } });
      expect(network).toHaveBeenCalledTimes(2);
      expect((await service.resume('async-op')).status).toBe('VERIFIED');
    } finally { service.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(['existing', 'fresh'])('continues a known partial Meta hierarchy without recreating parents or %s media', async media => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-meta-partial-'));
    let nextId = 100, posts = 0, imageUploads = 0;
    const objects = new Map<string, any>();
    const network = vi.fn(async (rawUrl: any, init: any) => {
      const url = new URL(String(rawUrl));
      if (init.method === 'GET') return new Response(JSON.stringify(objects.get(url.pathname.split('/').at(-1)!) ?? {}));
      if (url.pathname.endsWith('/adimages')) { imageUploads++; return new Response('{"images":{"image":{"hash":"uploaded-hash"}}}'); }
      if ([2, 4].includes(++posts)) return new Response('{"error":{"message":"invalid child"}}', { status: 400 });
      const body = new URLSearchParams(init.body); const id = String(++nextId);
      const values = Object.fromEntries([...body.entries()].map(([key, value]) => { try { return [key, JSON.parse(value)]; } catch { return [key, value]; } }));
      objects.set(id, { id, ...values, effective_status: values.status });
      return new Response(JSON.stringify({ id }));
    });
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, verifiedAccounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'test' }, fetch: network });
    const spec = { campaign: { name: 'Traffic', objective: 'OUTCOME_TRAFFIC', budgetOwner: 'AD_SET', dailyBudget: 1000, bidStrategy: 'LOWEST_COST_WITHOUT_CAP', specialAdCategories: [] }, adSet: { name: 'Visitors', conversionLocation: 'WEBSITE', performanceGoal: 'LANDING_PAGE_VIEWS', billingEvent: 'IMPRESSIONS', targeting: { countries: ['IN'] }, placements: ['facebook_feed'] }, ad: { name: 'Ad', pageId: '999', creative: media === 'fresh' ? { imageBytes: 'aW1n' } : { imageHash: 'hash' }, destinationUrl: 'https://example.com', primaryText: 'Visit', callToAction: 'LEARN_MORE' } };
    try {
      await service.call('meta_ads_readiness', { accountId: '123', snapshot: { businessManagerId: '1', pageId: '999', paymentReady: true, businessVerified: true, adsManagement: true, accessTier: 'Limited', tokenHealthy: true, assetAccessHealthy: true, currency: 'INR', timezone: 'Asia/Kolkata' } });
      await service.call('ads_launch_meta', { accountId: '123', launchId: 'partial-launch', spec });
      service.decide('partial-launch', true);
      expect((await service.resume('partial-launch')).status).toBe('PARTIAL');
      const pending = await service.call('ads_continue_meta_launch', { accountId: '123', launchId: 'partial-launch', operationId: 'partial-continuation' });
      expect(pending).toMatchObject({ status: 'PENDING_APPROVAL', args: { existingIds: { campaign: '101' } } });
      service.decide('partial-continuation', true);
      expect(await service.resume('partial-continuation')).toMatchObject({ status: 'PARTIAL', result: { ids: { campaign: '101', adset: '102' } } });
      const competing = new AdsService({ storageDir: dir, mode: 'live-with-approval', accounts: { meta: ['123'] } });
      try {
        await expect(competing.call('ads_continue_meta_launch', { accountId: '123', launchId: 'partial-launch', operationId: 'stale-branch' })).rejects.toThrow('partial-continuation');
      } finally { competing.close(); }
      const next = await service.call('ads_continue_meta_launch', { accountId: '123', launchId: 'partial-continuation', operationId: 'finish-continuation' });
      expect(next.args.existingIds).toEqual({ campaign: '101', adset: '102', ...(media === 'fresh' ? { imageHash: 'uploaded-hash' } : {}) });
      service.decide('finish-continuation', true);
      const result = await service.resume('finish-continuation');
      expect(result).toMatchObject({ status: 'VERIFIED', result: { ids: { campaign: '101', adset: '102', creative: '103', ad: '104' } } });
      expect(posts).toBe(6);
      expect(imageUploads).toBe(media === 'fresh' ? 1 : 0);
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
