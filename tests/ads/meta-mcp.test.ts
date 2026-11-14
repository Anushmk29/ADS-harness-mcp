import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdsService } from '../../src/modules/ads/service.js';
import { metaMcpMapping } from '../../src/modules/ads/meta-mcp/mapping.js';
import { metaMcpSnapshot } from '../../src/modules/ads/meta-mcp/snapshot.js';
import { MetaMcpToolError } from '../../src/modules/ads/meta-mcp/client.js';
import { createDepartment } from '../../src/departments/runtime.js';

// The 91 tools on Meta's docs pages (2026-10-11), as listed in docs/plans/meta-ads-parity-plan-2026-10-11.md section 2.
const DOCUMENTED = `ads_get_ad_entities ads_get_opportunity_score ads_insights_advertiser_context ads_insights_anomaly_signal ads_insights_auction_ranking_benchmarks ads_insights_industry_benchmark ads_insights_performance_trend
ads_get_ad_accounts ads_get_ad_account_pages ads_get_pages_for_business ads_get_user_pages ads_get_field_context ads_create_campaign ads_create_ad_set ads_create_ad ads_update_entity ads_activate_entity ads_create_creative ads_get_creatives ads_get_creative_ads ads_get_ad_images ads_get_ad_videos ads_get_ad_preview ads_library_search ads_get_ig_accounts ads_get_ig_media ads_boost_ig_post ads_get_ad_account_custom_audiences ads_get_custom_audience ads_get_custom_audience_adsets ads_create_custom_audience ads_update_custom_audience ads_update_custom_audience_users ads_delete_custom_audience
ads_catalog_create ads_catalog_update_catalog ads_catalog_get_catalogs ads_catalog_get_details ads_catalog_get_diagnostics ads_catalog_get_dynamic_ads_health ads_catalog_get_data_sources ads_catalog_get_product_details ads_catalog_product_create ads_catalog_update_product ads_catalog_delete_product ads_catalog_get_product_product_sets ads_catalog_search_product ads_catalog_create_product_set ads_catalog_update_product_set ads_catalog_get_product_sets ads_catalog_get_product_set_details ads_catalog_get_product_set_products ads_catalog_product_set_delete ads_catalog_create_product_feed ads_catalog_update_product_feed ads_catalog_get_product_feed_details ads_catalog_create_product_feed_upload_session ads_catalog_get_product_feed_upload_sessions ads_catalog_product_feed_delete ads_catalog_create_feed_rule ads_catalog_get_feed_rules ads_catalog_product_feed_delete_rule ads_catalog_event_source_get ads_catalog_event_source_get_catalogs ads_catalog_event_source_get_health ads_catalog_event_source_get_recommendations ads_catalog_event_source_connect ads_catalog_event_source_disconnect
ads_get_datasets ads_get_dataset_details ads_get_dataset_stats ads_get_dataset_quality ads_pixel_event_read ads_pixel_event_create ads_pixel_event_update ads_pixel_event_delete ads_pixel_parameter_read ads_pixel_parameter_create ads_pixel_parameter_update ads_pixel_parameter_delete ads_get_customconversions
ads_get_errors ads_get_help_article
ads_experiment_list_tests ads_experiment_check_eligibility ads_experiment_abtest_create_test ads_experiment_abtest_get_test ads_experiment_abtest_update_test ads_experiment_lift_create_test ads_experiment_lift_get_test
ads_account_get_activity_logs`.split(/\s+/);

const fake = (impl: (name: string, args: any) => any = () => ({ ok: true })) => {
  const callTool = vi.fn(async (name: string, args: any) => impl(name, args));
  return { metaMcp: { callTool }, callTool };
};
const dirs: string[] = [];
const tmp = () => { const dir = mkdtempSync(join(tmpdir(), 'meta-mcp-')); dirs.push(dir); return dir; };
afterEach(() => {
  vi.unstubAllEnvs();
  delete metaMcpMapping.ads_create_campaign.accountParam;
  delete metaMcpMapping.ads_update_custom_audience_users.accountParam;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Meta Ads MCP coverage', () => {
  it('snapshot and mapping cover exactly the same tools, nothing left out', () => {
    const snap = metaMcpSnapshot.tools.map(t => t.name).sort();
    expect(Object.keys(metaMcpMapping).sort()).toEqual(snap);
    if (metaMcpSnapshot.source === 'docs') expect(snap).toEqual([...DOCUMENTED].sort());
    expect(DOCUMENTED).toHaveLength(91);
  });

  it('classifies 55 reads and 36 writes, with activation blocked', () => {
    const rules = DOCUMENTED.map(name => metaMcpMapping[name]);
    expect(rules.filter(r => !r.write)).toHaveLength(55);
    expect(rules.filter(r => r.write)).toHaveLength(36);
    expect(Object.entries(metaMcpMapping).filter(([, r]) => r.blocked).map(([n]) => n)).toEqual(['ads_activate_entity']);
  });

  it('lists every tool as meta_mcp_* with Meta schema nested unchanged, only when enabled', () => {
    const off = new AdsService({ enableMetaMcp: false });
    const on = new AdsService({ enableMetaMcp: true });
    try {
      expect(off.listTools().some(t => t.name.startsWith('meta_mcp_'))).toBe(false);
      const tools = on.listTools().filter(t => t.name.startsWith('meta_mcp_'));
      expect(tools).toHaveLength(91);
      const entities = tools.find(t => t.name === 'meta_mcp_ads_get_ad_entities')!;
      expect((entities.parameters as any).properties.arguments.type).toBe('object');
      expect(tools.find(t => t.name === 'meta_mcp_ads_create_campaign')!.parameters).toMatchObject({ required: ['accountId'] });
    } finally { off.close(); on.close(); }
  });

  it('refuses calls while the flag is off', async () => {
    const { metaMcp, callTool } = fake();
    const service = new AdsService({ enableMetaMcp: false, metaMcp });
    try {
      await expect(service.call('meta_mcp_ads_get_ad_accounts', {})).rejects.toThrow('ADS_META_MCP=on');
      expect(callTool).not.toHaveBeenCalled();
    } finally { service.close(); }
  });

  it('is visible through the ads department (what marketing-mcp serves)', async () => {
    vi.stubEnv('ADS_META_MCP', 'on');
    const runtime = createDepartment('ads', { storageDir: tmp() });
    try {
      expect((await runtime.listTools()).filter((t: any) => t.name.startsWith('meta_mcp_'))).toHaveLength(91);
    } finally { await runtime.close(); }
  });
});

describe('Meta Ads MCP calls', () => {
  it('passes reads straight through', async () => {
    const { metaMcp, callTool } = fake(() => ({ data: [{ id: '1', spend: '10' }] }));
    const service = new AdsService({ enableMetaMcp: true, accounts: { meta: ['123'] }, metaMcp, tokens: { meta: 't' } });
    try {
      const out = await service.call('meta_mcp_ads_get_ad_entities', { accountId: '123', arguments: { level: 'campaign' } });
      expect(callTool).toHaveBeenCalledWith('ads_get_ad_entities', { level: 'campaign' });
      expect(out).toMatchObject({ status: 'COMPLETED', data: { data: [{ id: '1' }] } });
    } finally { service.close(); }
  });

  it('refuses unsafe writes before any network call', async () => {
    const { metaMcp, callTool } = fake();
    const service = new AdsService({ mode: 'live-with-approval', enableMetaMcp: true, accounts: { meta: ['123'] }, maxBudgetPerWrite: { meta: 5000 }, storageDir: tmp(), metaMcp, tokens: { meta: 't' } });
    const write = (name: string, args: any) => service.call(`meta_mcp_${name}`, { accountId: '123', operationId: 'op-1', ...args });
    try {
      await expect(write('ads_create_campaign', { arguments: { ad_account_id: '123' } })).rejects.toThrow('no accountParam');
      metaMcpMapping.ads_create_campaign.accountParam = 'ad_account_id';
      await expect(write('ads_activate_entity', { arguments: { id: '9' } })).rejects.toThrow('Ads Manager');
      await expect(write('ads_create_campaign', { arguments: {} })).rejects.toThrow('arguments.ad_account_id');
      await expect(write('ads_create_campaign', { arguments: { ad_account_id: '999' } })).rejects.toThrow('does not match');
      await expect(service.call('meta_mcp_ads_create_campaign', { accountId: '999', operationId: 'op', arguments: { ad_account_id: '999' } })).rejects.toThrow('allowlist');
      await expect(write('ads_create_campaign', { arguments: { ad_account_id: 'act_123', status: 'ACTIVE' } })).rejects.toThrow('activation is disabled');
      await expect(write('ads_create_campaign', { arguments: { ad_account_id: '123', daily_budget: 900000 } })).rejects.toThrow('ceiling');
      await expect(service.call('meta_mcp_ads_create_campaign', { accountId: '123', arguments: { ad_account_id: '123' } })).rejects.toThrow('operationId');
      metaMcpMapping.ads_update_custom_audience_users.accountParam = 'ad_account_id';
      await expect(write('ads_update_custom_audience_users', { arguments: { ad_account_id: '123', audience_id: '5551234567', users: [['jane@example.com']] } })).rejects.toThrow('SHA-256');
      await expect(write('ads_update_custom_audience_users', { arguments: { ad_account_id: '123', users: [['+91 98765 43210']] } })).rejects.toThrow('SHA-256');
      expect(callTool).not.toHaveBeenCalled();
    } finally { service.close(); }
  });

  it('records writes without sending them in dry-run', async () => {
    metaMcpMapping.ads_create_campaign.accountParam = 'ad_account_id';
    const { metaMcp, callTool } = fake();
    const service = new AdsService({ mode: 'dry-run', enableMetaMcp: true, accounts: { meta: ['123'] }, metaMcp });
    try {
      expect(await service.call('meta_mcp_ads_create_campaign', { accountId: '123', arguments: { ad_account_id: '123' } })).toMatchObject({ status: 'DRY_RUN', dispatched: false });
      expect(callTool).not.toHaveBeenCalled();
    } finally { service.close(); }
  });

  it('dispatches an approved write exactly once, and leaves a lost response UNCERTAIN without retrying', async () => {
    metaMcpMapping.ads_create_campaign.accountParam = 'ad_account_id';
    const sha = 'a'.repeat(64);
    const ok = fake(() => ({ id: '777' }));
    const service = new AdsService({ mode: 'live-with-approval', enableMetaMcp: true, accounts: { meta: ['123'] }, storageDir: tmp(), metaMcp: ok.metaMcp, tokens: { meta: 't' } });
    try {
      const args = { accountId: '123', operationId: 'mcp-create', arguments: { ad_account_id: '123', name: 'Test', hashed: [sha] } };
      expect((await service.call('meta_mcp_ads_create_campaign', args)).status).toBe('PENDING_APPROVAL');
      service.decide('mcp-create', true);
      const done = await service.resume('mcp-create');
      expect(done).toMatchObject({ status: 'DISPATCHED', result: { id: '777' } });
      expect(ok.callTool).toHaveBeenCalledTimes(1);
      expect(ok.callTool).toHaveBeenCalledWith('ads_create_campaign', args.arguments);
    } finally { service.close(); }

    const lost = fake(() => { throw new Error('socket hang up'); });
    const second = new AdsService({ mode: 'live-with-approval', enableMetaMcp: true, accounts: { meta: ['123'] }, storageDir: tmp(), metaMcp: lost.metaMcp, tokens: { meta: 't' } });
    try {
      await second.call('meta_mcp_ads_create_campaign', { accountId: '123', operationId: 'mcp-lost', arguments: { ad_account_id: '123' } });
      second.decide('mcp-lost', true);
      expect((await second.resume('mcp-lost')).status).toBe('UNCERTAIN');
      expect(lost.callTool).toHaveBeenCalledTimes(1);
    } finally { second.close(); }
  });

  it('marks a write Meta rejected as FAILED', async () => {
    metaMcpMapping.ads_create_campaign.accountParam = 'ad_account_id';
    const rejected = fake(() => { throw new MetaMcpToolError('Invalid objective'); });
    const service = new AdsService({ mode: 'live-with-approval', enableMetaMcp: true, accounts: { meta: ['123'] }, storageDir: tmp(), metaMcp: rejected.metaMcp, tokens: { meta: 't' } });
    try {
      await service.call('meta_mcp_ads_create_campaign', { accountId: '123', operationId: 'mcp-bad', arguments: { ad_account_id: '123' } });
      service.decide('mcp-bad', true);
      expect(await service.resume('mcp-bad')).toMatchObject({ status: 'FAILED', error: expect.stringContaining('Invalid objective') });
    } finally { service.close(); }
  });
});
