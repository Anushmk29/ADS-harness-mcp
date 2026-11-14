import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MCPClient } from '../../src/mcp/mcp-client.js';
import { registerDirectAdapters } from '../../src/modules/ads/providers/direct-adapter.js';
import { performanceReportingSkill } from '../../src/modules/ads/skills/campaign-optimization.skill.js';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { DEFAULT_BUSINESS_CONFIG } from '../../src/config/default-config.js';

describe('direct ads adapter', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('carries real Meta leads and confirmed currencies through to the report without adding unlike counts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-adapters-'));
    const policy = join(dir, 'ads-module.yaml');
    writeFileSync(policy, "mode: dry-run\naccounts:\n  meta: ['123']\n  google: ['456']\n");
    vi.stubEnv('DATA_DIR', dir);
    vi.stubEnv('ADS_POLICY_FILE', policy);
    vi.stubEnv('ADS_DIRECT_META_ACCESS_TOKEN', 'meta');
    vi.stubEnv('ADS_DIRECT_GOOGLE_ACCESS_TOKEN', 'google');
    vi.stubEnv('ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN', 'developer');
    let googleCurrency = 'INR';
    vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
      if (String(url).includes('/me/adaccounts')) return new Response('{"data":[{"id":"act_123","currency":"INR"}]}');
      if (String(url).includes('/insights')) return new Response('{"data":[{"spend":"200","actions":[{"action_type":"lead","value":"7"},{"action_type":"leadgen_grouped","value":"7"}]}]}');
      const query = JSON.parse(init.body).query;
      return new Response(JSON.stringify(query === 'SELECT customer.currency_code FROM customer'
        ? { results: [{ customer: { currencyCode: googleCurrency } }] }
        : { results: [{ campaign: { id: '9', name: 'Google' }, metrics: { costMicros: '100000000', conversions: '3' } }] }));
    }));
    const client = new MCPClient(undefined, false);
    for (const id of ['meta-ads-mcp', 'google-ads-mcp']) client.registerServer({ id, name: id, version: '1', capabilities: [] });
    registerDirectAdapters(client, { google_ads: { mode: 'direct', defaultAccountId: '456' }, meta_ads: { mode: 'direct', defaultAccountId: '123' }, ga4: { mode: 'off' } });
    const context = { taskId: 'report', objective: 'Compare results', inputData: {}, memory: new MemoryManager(DEFAULT_BUSINESS_CONFIG, join(dir, 'memory')), mcp: client };
    const report = await performanceReportingSkill.execute(context);
    expect(report.executiveSummary).toMatchObject({ currency: 'INR', totalMarketingSpend: 300, googleConversions: 3, metaLeads: 7, totalConversions: null });
    expect(report.channelEfficiency[1]).toMatchObject({ channel: 'Meta Ads', leads: 7 });
    googleCurrency = 'USD';
    await expect(performanceReportingSkill.execute(context)).rejects.toThrow('matching, confirmed account currencies');
  });

  it('enforces the ads policy allowlist instead of trusting defaultAccountId', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-direct-'));
    const policy = join(dir, 'ads-module.yaml');
    writeFileSync(policy, "mode: dry-run\naccounts:\n  meta: ['123']\n");
    vi.stubEnv('ADS_POLICY_FILE', policy);
    vi.stubEnv('ADS_DIRECT_META_ACCESS_TOKEN', 'test');
    const network = vi.fn(async () => new Response('{"data":[]}'));
    vi.stubGlobal('fetch', network);
    const client = new MCPClient(undefined, false);
    client.registerServer({ id: 'meta-ads-mcp', name: 'meta_ads', version: '1', capabilities: [] });
    const off = { mode: 'off' as const };
    registerDirectAdapters(client, { google_ads: off, ga4: off, meta_ads: { mode: 'direct', defaultAccountId: '999' } });
    try {
      await expect(client.callTool('meta_ads_search_targeting', { type: 'adgeolocation', q: 'Pune' })).rejects.toThrow('allowlist');
      await client.callTool('meta_ads_search_targeting', { accountId: '123', type: 'adgeolocation', q: 'Pune' });
      expect(network).toHaveBeenCalledTimes(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
