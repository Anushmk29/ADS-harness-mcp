import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDepartment } from '../../src/departments/runtime.js';
import { AdsService } from '../../src/modules/ads/service.js';
import { runDeepSeek } from '../../src/core/deepseek/tool-runner.js';
import { DepartmentJobs } from '../../src/departments/jobs.js';
import { MCPClient } from '../../src/mcp/mcp-client.js';

describe('on-demand departments', () => {
  it('clears simulation tools when changing the provider loader', async () => {
    const client = new MCPClient(undefined, false);
    client.registerServer({ id: 'mock', name: 'mock', version: '1', capabilities: [] });
    client.registerTool('mock', { name: 'sample', description: '', parameters: {}, handler: async () => 'mock' });
    client.setLoader(async () => { throw new Error('Live credentials missing'); });
    await expect(client.callTool('sample', {})).rejects.toThrow('Live credentials missing');
  });
  it('discovers capabilities without network calls or active departments', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network'));
    try {
      const host = createDepartment('hq');
      expect(host.listCapabilities().some(c => c.department === 'research')).toBe(true);
      expect(host.listCapabilities().some(c => ['content', 'blog', 'social'].includes(c.department as string))).toBe(false);
      expect(host.getActiveDepartments()).toEqual([]);
      expect(network).not.toHaveBeenCalled();
      await host.close();
      await expect(host.run({ capability: 'skill_performance_reporting' })).rejects.toThrow('closed');
    } finally { network.mockRestore(); }
  });
  it('routes a simulation tool to its owner and does not activate siblings', async () => {
    const host = createDepartment('hq', { mode: 'simulation' });
    const result = await host.run({ capability: 'meta_ads_get_performance_and_fatigue', input: {} });
    expect(result.mode).toBe('simulation');
    expect(result.department).toBe('ads');
    expect(host.getActiveDepartments()).toEqual(['ads']);
    await host.close();
  });
  it('rejects cross-department calls and never falls back to simulation in live mode', async () => {
    const analytics = createDepartment('analytics');
    await expect(analytics.run({ capability: 'meta_ads_list_accounts' })).rejects.toThrow('belongs to ads');
    const research = createDepartment('research');
    await expect(research.run({ capability: 'research_serp_intent_cluster' })).rejects.toThrow('no live connector');
    await analytics.close(); await research.close();
  });
});

describe('durable ads execution', () => {
  it('preserves provider validation details without exposing the token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-errors-'));
    const network = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid parameter', error_user_msg: 'Choose a supported optimization goal', error_subcode: 123, error_data: { details: 'bad goal' } } }), { status: 400 }));
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'secret-token' }, fetch: network });
    try {
      await service.call('meta_ads_create_adset', { accountId: '123', operationId: 'bad-adset', data: { name: 'A', campaign_id: '456', optimization_goal: 'REACH', billing_event: 'IMPRESSIONS', targeting: {} } });
      service.decide('bad-adset', true);
      const result = await service.resume('bad-adset');
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Choose a supported optimization goal');
      expect(result.error).toContain('subcode 123');
      expect(result.error).not.toContain('secret-token');
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses the Meta targeting search endpoint for geo and interest lookups', async () => {
    const network = vi.fn(async (url: any) => {
      expect(new URL(String(url)).pathname).toBe('/v26.0/search');
      expect(new URL(String(url)).searchParams.get('type')).toBe('adgeolocation');
      return new Response('{"data":[]}');
    });
    const service = new AdsService({ accounts: { meta: ['123'] }, tokens: { meta: 'test' }, fetch: network });
    try { await service.call('meta_ads_search_targeting', { accountId: '123', type: 'adgeolocation', q: 'Madhya Pradesh' }); }
    finally { service.close(); }
  });
  it('isolates approval decisions between ads and analytics even with shared storage', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-isolation-'));
    const ads = createDepartment('ads', { storageDir: dir, ads: { mode: 'live-with-approval', accounts: { meta: ['123'] } } });
    const analytics = createDepartment('analytics', { storageDir: dir });
    try {
      await ads.run({ capability: 'meta_ads_create_campaign', input: { accountId: '123', operationId: 'scoped', data: { name: 'Paused', objective: 'OUTCOME_LEADS' } } });
      await expect(analytics.decide('scoped', true)).rejects.toThrow('another department');
      await expect(analytics.resume('scoped')).rejects.toThrow('another department');
    } finally { await ads.close(); await analytics.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses nested resource action paths and keeps asynchronous acceptance distinct', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-actions-'));
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN', 'test');
    const network = vi.fn(async (url: any) => {
      expect(String(url)).toContain('/customers/123/experiments/456:scheduleExperiment');
      return new Response('{"name":"customers/123/operations/pending"}');
    });
    const service = new AdsService({ storageDir: dir, tokens: { google: 'test' }, fetch: network, mode: 'live-with-approval', accounts: { google: ['123'] } });
    try {
      expect((await service.call('google_ads_schedule_experiment', { accountId: '123', objectId: '456', operationId: 'schedule' })).status).toBe('PENDING_APPROVAL');
      service.decide('schedule', true);
      expect((await service.resume('schedule')).status).toBe('DISPATCHED');
      expect((await service.resume('schedule')).status).toBe('DISPATCHED');
      expect(network).toHaveBeenCalledTimes(1);
    } finally { service.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('builds and resumes the entire paused Meta hierarchy without duplicate objects', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-launch-'));
    let nextId = 100;
    const bodies: URLSearchParams[] = [];
    const objects = new Map<string, any>();
    const network = vi.fn(async (rawUrl: any, request: any) => {
      const url = new URL(String(rawUrl));
      if (request.method === 'GET') return new Response(JSON.stringify(objects.get(url.pathname.split('/').at(-1)!) ?? {}));
      const body = new URLSearchParams(request.body); bodies.push(body);
      const values = Object.fromEntries([...body.entries()].map(([key, value]) => { try { return [key, JSON.parse(value)]; } catch { return [key, value]; } }));
      const id = String(++nextId); objects.set(id, { id, ...values, effective_status: values.status });
      return new Response(JSON.stringify({ id }));
    });
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, verifiedAccounts: { meta: ['123'] }, tokens: { meta: 'test' }, storageDir: dir, fetch: network, maxBudgetPerWrite: { meta: 5000 } });
    try {
      await service.call('meta_ads_readiness', { accountId: '123', snapshot: { businessManagerId: '1', pageId: '999', paymentReady: true, businessVerified: true, adsManagement: true, accessTier: 'Limited', tokenHealthy: true, assetAccessHealthy: true, currency: 'INR', timezone: 'Asia/Kolkata' } });
      const input = { accountId: '123', launchId: 'hierarchy', spec: { campaign: { name: 'Traffic campaign', objective: 'OUTCOME_TRAFFIC', budgetOwner: 'AD_SET', dailyBudget: 1000, bidStrategy: 'LOWEST_COST_WITHOUT_CAP', specialAdCategories: [] }, adSet: { name: 'Audience', conversionLocation: 'WEBSITE', performanceGoal: 'LANDING_PAGE_VIEWS', billingEvent: 'IMPRESSIONS', targeting: { geo_locations: { countries: ['IN'] } }, placements: ['facebook_feed'] }, ad: { name: 'Ad', pageId: '999', creative: { imageHash: 'existing-image' }, destinationUrl: 'https://example.com', primaryText: 'Approved copy', callToAction: 'LEARN_MORE' } } };
      const pending = await service.call('ads_launch_meta', input);
      expect(pending).toMatchObject({ status: 'PENDING_APPROVAL', binding: { operationId: 'hierarchy', object: 'hierarchy' } });
      service.decide('hierarchy', true);
      const result = await service.resume('hierarchy');
      expect(result).toMatchObject({ status: 'VERIFIED', result: { ids: { campaign: '101', adset: '102', creative: '103', ad: '104' }, delivery: 'PAUSED' } });
      expect(bodies[1].get('campaign_id')).toBe('101');
      expect(bodies[3].get('creative')).toBe('{"creative_id":"103"}');
      expect(bodies[0].get('status')).toBe('PAUSED');
      expect(bodies[1].get('status')).toBe('PAUSED');
      expect(bodies[3].get('status')).toBe('PAUSED');
      expect((await service.call('ads_launch_meta', input)).result.ids).toEqual(result.result.ids);
      expect(network).toHaveBeenCalledTimes(8);
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('serializes duplicate approved operations across service instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-concurrent-'));
    const network = vi.fn(async () => new Response('{"id":"456"}'));
    const opts = { mode: 'live-with-approval' as const, accounts: { meta: ['123'] }, tokens: { meta: 'test' }, storageDir: dir, fetch: network };
    const first = new AdsService(opts), second = new AdsService(opts);
    try {
      const input = { accountId: '123', operationId: 'same-operation', data: { name: 'One', objective: 'OUTCOME_LEADS' } };
      await Promise.all([first.call('meta_ads_create_campaign', input), second.call('meta_ads_create_campaign', input)]);
      first.decide('same-operation', true);
      await Promise.all([first.resume('same-operation'), second.resume('same-operation')]);
      expect(network).toHaveBeenCalledTimes(1);
      expect((await second.resume('same-operation')).status).toBe('DISPATCHED');
    } finally { first.close(); second.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('checks ownership before an ad update and preserves Google partial failures', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-scopes-'));
    const network = vi.fn(async () => new Response('{"account_id":"999"}'));
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, tokens: { meta: 'test' }, storageDir: dir, fetch: network });
    try {
      await service.call('meta_ads_update_ad', { accountId: '123', objectId: '456', operationId: 'pause-1', data: { status: 'PAUSED' } });
      service.decide('pause-1', true);
      const result = await service.resume('pause-1');
      expect(result).toMatchObject({ status: 'FAILED', error: expect.stringContaining('does not belong') });
      expect(network).toHaveBeenCalledTimes(1);
      expect((network.mock.calls[0] as any)[1].method).toBe('GET');
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses correct Google resource paths, update masks and partial status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-google-'));
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN','test-dev');
    const network = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain('/customers/123/campaigns:mutate');
      expect(JSON.parse(init.body).operations[0]).toEqual({ update: { resourceName: 'customers/123/campaigns/456', status: 'PAUSED' }, updateMask: 'status' });
      return new Response(JSON.stringify({ results: [{}], partialFailureError: { code: 3, message: 'Invalid operation' } }));
    });
    const service = new AdsService({ mode: 'live-with-approval', accounts: { google: ['123'] }, tokens: { google: 'test' }, storageDir: dir, fetch: network });
    try {
      await service.call('google_ads_mutate_campaigns', { accountId: '123', operationId: 'change', operations: [{ update: { resourceName: 'customers/123/campaigns/456', status: 'PAUSED' }, updateMask: 'status' }], partialFailure: true });
      service.decide('change', true);
      const result = await service.resume('change');
      expect(result.status).toBe('PARTIAL');
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); }
  });
  it('does not double count cross-platform order revenue or invent a zero-spend ROAS', async () => {
    const service = new AdsService();
    const result = await service.call('ads_compare_performance', { currency: 'INR', since: '2026-09-01', until: '2026-09-10', channels: [{ platform: 'meta', currency: 'INR', spend: 100, attributedRevenue: 1000 }, { platform: 'google', currency: 'INR', spend: 100, attributedRevenue: 1000 }], orders: [{ orderId: 'same', currency: 'INR', revenue: 1000 }, { orderId: 'same', currency: 'INR', revenue: 1000 }] });
    expect(result.data.blended).toEqual({ spend: 200, deduplicatedRevenue: 1000, roas: 5, orders: 1 }); service.close();
  });
  it('dry-run validates but sends no request', async () => {
    const network = vi.fn();
    const service = new AdsService({ mode: 'dry-run', accounts: { meta: ['123'] }, fetch: network });
    const result = await service.call('meta_ads_create_campaign', { accountId: '123', data: { name: 'Test', objective: 'OUTCOME_LEADS' } });
    expect(result.status).toBe('DRY_RUN'); expect(network).not.toHaveBeenCalled(); service.close();
  });
  it('resumes an exact approved payload after restart and does not repeat a completed write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-journal-'));
    const network = vi.fn(async () => new Response(JSON.stringify({ id: '789' })));
    const options = { mode: 'live-with-approval' as const, accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'test-token' }, fetch: network as typeof fetch };
    let service = new AdsService(options);
    try {
      const args = { accountId: '123', operationId: 'launch-1', data: { name: 'Test', objective: 'OUTCOME_LEADS' } };
      expect((await service.call('meta_ads_create_campaign', args)).status).toBe('PENDING_APPROVAL');
      service.decide('launch-1', true); service.close();
      service = new AdsService(options);
      expect((await service.resume('launch-1')).status).toBe('DISPATCHED');
      expect((await service.call('meta_ads_create_campaign', args)).result.id).toBe('789');
      expect(network).toHaveBeenCalledTimes(1);
      const [url, request] = network.mock.calls[0] as any;
      expect(String(url)).toContain('/act_123/campaigns');
      expect(String(url)).not.toContain('test-token');
      expect(new URLSearchParams(request.body).get('status')).toBe('PAUSED');
      expect(new URLSearchParams(request.body).get('special_ad_categories')).toBe('[]');
      await expect(service.call('meta_ads_create_campaign', { ...args, data: { ...args.data, name: 'Changed' } })).rejects.toThrow('different payload');
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps an uncertain write unresolved instead of retrying it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-uncertain-'));
    const network = vi.fn(async () => { throw new Error('Connection lost'); });
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'test' }, fetch: network });
    try {
      await service.call('meta_ads_create_campaign', { accountId: '123', operationId: 'once', data: { name: 'Test', objective: 'OUTCOME_LEADS' } });
      service.decide('once', true);
      const result = await service.resume('once');
      expect(result.status).toBe('UNCERTAIN');
      expect((await service.resume('once')).status).toBe('UNCERTAIN');
      expect(network).toHaveBeenCalledTimes(1);
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses GA4 direct report bodies and offset pagination', async () => {
    const network = vi.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      expect(body.reportRequest).toBeUndefined();
      return new Response(JSON.stringify({ rowCount: 2, rows: [{ dimensionValues: [{ value: body.offset ? 'second' : 'first' }] }] }));
    });
    const service = new AdsService({ tokens: { ga4: 'test' }, fetch: network });
    const result = await service.call('ga4_runReport', { accountId: '123', data: { dimensions: [{ name: 'country' }], metrics: [{ name: 'sessions' }], dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }] } });
    expect(result.data.rows).toHaveLength(2);
    expect(result.data._metadata).toMatchObject({ source: 'ga4', attributionBasis: 'GA4-attributed', minimumDataStatus: 'UNKNOWN' });
    expect(result.data._metadata.synchronizedAt).toBeTruthy();
    expect(network).toHaveBeenCalledTimes(2); service.close();
  });
});

describe('real model and explicit job orchestration', () => {
  it('does not inject write arguments into scheduled strict-schema reads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jobs-read-'));
    const jobs = new DepartmentJobs(dir);
    try {
      jobs.add({ id: 'accounts', department: 'ads', capability: 'meta_ads_list_accounts', nextRunAt: 1 });
      const result = await jobs.runDue({ ads: { tokens: { meta: 'test' }, fetch: async () => new Response('{"data":[]}') } }, 1);
      expect(result[0].status).toBe('COMPLETED');
    } finally { jobs.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('executes discovered tools and preserves provider reasoning messages', async () => {
    let turn = 0;
    const input = { currency: 'INR', since: '2026-09-01', until: '2026-09-10', channels: [{ platform: 'meta', currency: 'INR', spend: 100, attributedRevenue: 300 }] };
    const model = vi.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      turn++;
      if (turn === 3) {
        expect(body.messages.some((m: any) => m.role === 'tool' && m.content.includes('platformRoas'))).toBe(true);
        expect(body.messages.some((m: any) => m.reasoning_content === 'preserve-me')).toBe(true);
      }
      const message = turn === 1 ? { role: 'assistant', content: '', reasoning_content: 'preserve-me', tool_calls: [{ id: 'one', type: 'function', function: { name: 'discover', arguments: JSON.stringify({ department: 'ads', name: 'ads_compare_performance' }) } }] }
        : turn === 2 ? { role: 'assistant', content: '', tool_calls: [{ id: 'two', type: 'function', function: { name: 'execute', arguments: JSON.stringify({ department: 'ads', capability: 'ads_compare_performance', input }) } }] }
        : { role: 'assistant', content: 'Reported platform ROAS is 3.' };
      return new Response(JSON.stringify({ choices: [{ message }] }));
    });
    const result = await runDeepSeek('Compare this report', { apiKey: 'test', model: 'test-model', fetch: model });
    expect(result.status).toBe('COMPLETED'); expect(result.executions).toHaveLength(1);
  });
  it('runs only explicit due jobs and does not run a completed one twice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'department-jobs-'));
    const jobs = new DepartmentJobs(dir);
    try {
      expect(await jobs.runDue()).toEqual([]);
      jobs.add({ id: 'meta-audit', department: 'ads', capability: 'meta_ads_get_performance_and_fatigue', nextRunAt: 100 });
      expect(await jobs.runDue({ mode: 'simulation' }, 99)).toEqual([]);
      expect(await jobs.runDue({ mode: 'simulation' }, 100)).toHaveLength(1);
      expect(await jobs.runDue({ mode: 'simulation' }, 101)).toEqual([]);
    } finally { jobs.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
