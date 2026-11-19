import { describe, expect, it, vi } from 'vitest';
import { collectFindingsData, runRules, type FindingsData, type Row } from '../../src/modules/ads/findings.js';
import { proposeActions, rankActions } from '../../src/modules/ads/actions.js';

const row = (level: Row['level'], id: string, m: Partial<Row> = {}): Row => ({ level, id, name: `${level}-${id}`, spend: 0, impressions: 0, clicks: 0, results: 0, revenue: 0, ...m });
const data = (current: Row[], baseline: Row[] = []): FindingsData => ({ accountId: '1', since: '2026-11-12', until: '2026-11-18', days: 7, current, baseline });
const rules = (d: FindingsData, s: Partial<Parameters<typeof runRules>[1]> = {}) => runRules(d, { goal: 'lead', targets: { cpa: 100 }, ...s });
const ids = (r: ReturnType<typeof runRules>) => r.findings.map(f => f.rule);

describe('findings rules', () => {
  it('3x kill rule: pauses an ad set that spent 3x target with no results', () => {
    const r = rules(data([row('account', '1', { spend: 1000, clicks: 50, results: 6 }), row('adset', 'a', { spend: 350 }), row('adset', 'b', { spend: 650, results: 6 })]));
    const kill = r.findings.find(f => f.rule === 'kill_no_results')!;
    expect(kill).toMatchObject({ severity: 'critical', suggestion: 'pause', entity: { id: 'a' } });
    expect(kill.message).toContain('3x');
  });

  it('flags high-cost ad sets and winners against the target', () => {
    const r = rules(data([row('account', '1', { spend: 3000, results: 26, clicks: 90 }),
      row('adset', 'bad', { spend: 1600, results: 8 }), row('adset', 'good', { spend: 1000, results: 16 })]));
    expect(r.findings.find(f => f.entity.id === 'bad')?.rule).toBe('adset_cpa_high');
    expect(r.findings.find(f => f.entity.id === 'good')?.rule).toBe('adset_winner');
  });

  it('says wait instead of judging cost when results are too few', () => {
    const r = rules(data([row('account', '1', { spend: 300, results: 2, clicks: 40 }), row('adset', 'a', { spend: 300, results: 2 })]));
    expect(r.dataStatus).toBe('INSUFFICIENT');
    expect(ids(r)).toEqual(['insufficient_data']);
    expect(rankActions(r.findings, data([]))).toEqual([]);
  });

  it('detects broken tracking and then proposes only the tracking check', () => {
    const d = data([row('account', '1', { spend: 1000, clicks: 400, results: 0 }), row('adset', 'a', { spend: 1000, results: 0 })]);
    const r = rules(d);
    expect(ids(r)).toContain('tracking_no_results');
    const actions = rankActions(r.findings, d);
    expect(actions.map(a => a.rule)).toEqual(['tracking_no_results']);
  });

  it('detects a tracking drop when results halve but clicks hold', () => {
    const r = rules(data([row('account', '1', { spend: 1000, clicks: 500, results: 5 })], [row('account', '1', { spend: 1000, clicks: 520, results: 20 })]));
    expect(ids(r)).toContain('tracking_drop');
  });

  it('detects creative fatigue, weak CTR, saturation, learning limited, underspend and spend concentration', () => {
    const d = data([
      row('account', '1', { spend: 2000, impressions: 40000, clicks: 800, results: 20 }),
      row('adset', 'big', { spend: 1500, results: 4, frequency: 5.2, learning: 'FAIL' }),
      row('adset', 'small', { spend: 500, results: 16, dailyBudget: 200 }),
      row('ad', 'tired', { adsetId: 'small', impressions: 10000, clicks: 100, spend: 400, results: 5 }),
      row('ad', 'dull', { adsetId: 'small', impressions: 5000, clicks: 20, spend: 50, results: 1 })
    ], [row('ad', 'tired', { impressions: 10000, clicks: 300, spend: 200, results: 10 })]);
    const found = ids(rules(d));
    for (const rule of ['creative_fatigue', 'weak_ctr', 'audience_saturation', 'learning_limited', 'underspend', 'spend_concentration']) expect(found).toContain(rule);
  });

  it('checks ROAS and cost trend for a purchase-goal client', () => {
    const r = rules(data([row('account', '1', { spend: 1000, results: 10, revenue: 1500, clicks: 300 })], [row('account', '1', { spend: 1000, results: 20, revenue: 4000, clicks: 300 })]),
      { goal: 'purchase', targets: { roas: 3 } });
    expect(ids(r)).toEqual(expect.arrayContaining(['roas_below_target', 'account_cpa_rising']));
    expect(r.findings.find(f => f.rule === 'roas_below_target')!.message).toContain('ROAS is 1.5');
  });

  it('falls back to the account baseline cost when no target is configured', () => {
    const r = runRules(data([row('account', '1', { spend: 1000, results: 10, clicks: 100 }), row('adset', 'a', { spend: 700 })], [row('account', '1', { spend: 1000, results: 5, clicks: 100 })]), { goal: 'lead', targets: {} });
    expect(r.targetCpa).toBe(200);
    expect(ids(r)).toContain('kill_no_results');
  });
});

describe('action ranker', () => {
  it('turns findings into ranked operations with budget math and manual steps', () => {
    const d = data([row('account', '1', { spend: 3000, results: 26, clicks: 90 }),
      row('adset', 'dead', { spend: 400 }), row('adset', 'good', { spend: 1000, results: 16, dailyBudget: 150 }), row('adset', 'cbo', { spend: 1600, results: 10 })]);
    const actions = rankActions(rules(d).findings, d);
    expect(actions[0]).toMatchObject({ rank: 1, rule: 'kill_no_results', operation: { tool: 'meta_ads_update_adset', args: { objectId: 'dead', data: { status: 'PAUSED' } } } });
    expect(actions.find(a => a.entity.id === 'good')!.operation!.args.data).toEqual({ daily_budget: 18000 }); // 150 -> 180, minor units
    expect(actions.find(a => a.entity.id === 'cbo')).toMatchObject({ manualStep: expect.stringContaining('campaign level') });
  });

  it('proposes writes with stable operation ids and survives a refused one', async () => {
    const call = vi.fn().mockResolvedValueOnce({ status: 'PENDING_APPROVAL' }).mockRejectedValueOnce(new Error('Budget/bid amount exceeds the configured per-write ceiling'));
    const actions = [
      { rank: 1, score: 3, rule: 'kill_no_results', title: 'Pause', why: '', entity: { level: 'adset' as const, id: '5', name: 'x' }, operation: { tool: 'meta_ads_update_adset', args: { accountId: '1', objectId: '5', data: { status: 'PAUSED' } } } },
      { rank: 2, score: 2, rule: 'adset_winner', title: 'Raise', why: '', entity: { level: 'adset' as const, id: '6', name: 'y' }, operation: { tool: 'meta_ads_update_adset', args: { accountId: '1', objectId: '6', data: { daily_budget: 99999 } } } },
      { rank: 3, score: 1, rule: 'creative_fatigue', title: 'New creative', why: '', entity: { level: 'ad' as const, id: '7', name: 'z' }, manualStep: 'brief' }
    ];
    const out = await proposeActions(actions, call, '2026-11-18');
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[0][1]).toMatchObject({ operationId: 'review-kill_no_results-5-2026-11-18' });
    expect(out.map(p => p.status)).toEqual(['PENDING_APPROVAL', 'FAILED']);
  });
});

describe('collectFindingsData', () => {
  it('reads both windows at every level and attaches budgets and learning status', async () => {
    const now = new Date(2026, 10, 19, 9).getTime();
    const read = vi.fn(async (tool: string, args: any) => {
      if (tool === 'meta_ads_list_adset') return { data: [{ id: '20', daily_budget: '50000', learning_stage_info: { status: 'FAIL' } }] };
      const current = args.since === '2026-11-12';
      if (args.level === 'adset') return { data: [{ adset_id: '20', adset_name: 'Women 25-34', campaign_id: '10', spend: current ? '700' : '300', impressions: '9000', clicks: '90', frequency: '2.1',
        actions: [{ action_type: 'purchase', value: '3' }], action_values: [{ action_type: 'purchase', value: '2100' }] }] };
      return { data: [] };
    });
    const d = await collectFindingsData(read, '1', 'purchase', now);
    expect([d.since, d.until]).toEqual(['2026-11-12', '2026-11-18']);
    expect(read).toHaveBeenCalledTimes(9);
    expect(d.current.find(r => r.level === 'adset')).toMatchObject({ id: '20', name: 'Women 25-34', campaignId: '10', spend: 700, results: 3, revenue: 2100, frequency: 2.1, dailyBudget: 500, learning: 'FAIL' });
    expect(d.baseline.find(r => r.level === 'adset')?.spend).toBe(300);
  });
});

describe('ads_findings through AdsService', () => {
  it('reviews a live account and turns the top action into a pending approval, never a direct write', async () => {
    const { AdsService } = await import('../../src/modules/ads/service.js');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ads-findings-'));
    const network = vi.fn(async (url: any) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/adsets')) return new Response(JSON.stringify({ data: [{ id: '20', daily_budget: '20000' }] }));
      const level = u.searchParams.get('level'), current = (u.searchParams.get('time_range') ?? '').includes('"until":"2026-11-18"');
      const rows: Record<string, any[]> = {
        account: [{ account_id: '123', spend: '1200', impressions: '30000', clicks: '600', actions: [{ action_type: 'lead', value: current ? '12' : '10' }] }],
        adset: [{ adset_id: '20', adset_name: 'Dead set', campaign_id: '10', spend: '400', impressions: '9000', clicks: '90', actions: [] },
                { adset_id: '21', adset_name: 'Working set', campaign_id: '10', spend: '800', impressions: '21000', clicks: '510', actions: [{ action_type: 'lead', value: '12' }] }]
      };
      return new Response(JSON.stringify({ data: rows[level ?? ''] ?? [] }));
    });
    const service = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 'test' }, fetch: network, goal: 'lead', targets: { cpa: 100 } });
    try {
      const now = new Date(2026, 10, 19, 9).getTime();
      const review = await service.review('123', 7, now);
      expect(review.findings[0]).toMatchObject({ rule: 'kill_no_results', entity: { id: '20' } });
      expect(review.actions[0].operation).toMatchObject({ tool: 'meta_ads_update_adset', args: { objectId: '20', data: { status: 'PAUSED' } } });
      const proposals = await proposeActions(review.actions, (tool, args) => service.call(tool, args), review.period.until);
      expect(proposals[0]).toMatchObject({ status: 'PENDING_APPROVAL' });
      expect(network.mock.calls.every(([, init]: any) => !init?.method || init.method === 'GET')).toBe(true); // nothing was written
      const tool = await service.call('ads_list_records', { kind: 'findings' });
      expect(tool.data).toHaveLength(1);
      await expect(service.call('ads_findings', { accountId: '999' })).rejects.toThrow('allowlist');
    } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
