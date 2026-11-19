import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrackingStore } from '../../src/core/tracking/store.js';
import { snapshotKpis, metaLeads, metaPurchases, metaPurchaseValue } from '../../src/core/tracking/kpi-snapshot.js';
import { chat, setLlmSpendSource, LlmBudgetError, resetLlmHealth } from '../../src/core/llm/index.js';
import { VisualizationServer } from '../../src/server/server.js';
import { VisualizationEventBus } from '../../src/visualization/event-bus.js';
import { resetAlertDedup } from '../../src/observability/alerts.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'tracking-'));
afterEach(() => { setLlmSpendSource(undefined); delete process.env.LLM_MONTHLY_BUDGET_USD; resetLlmHealth(); resetAlertDedup(); });

describe('tracking store', () => {
  it('seeds milestones once and auto-ticks the first matching event', () => {
    const dir = tmp();
    let store = new TrackingStore(dir);
    store.log('system', 'ads.verified', 'Campaign applied', 'op-1', 1000);
    store.log('system', 'ads.verified', 'Another', 'op-2', 2000);
    store.close();
    store = new TrackingStore(dir);   // reopening does not re-seed or reset
    expect(store.milestones()).toHaveLength(6);
    expect(store.milestones().find(m => m.id === 'first-campaign-live')).toMatchObject({ status: 'done', doneAt: 1000 });
    expect(store.activity().filter(a => a.type === 'milestone.done')).toHaveLength(1);
    expect(store.summary().milestonePct).toBe(17);
    store.close();
  });

  it('keeps one KPI row per day and sums month-to-date cost', () => {
    const store = new TrackingStore(tmp());
    store.upsertKpi('2026-10-10', 'meta', 'spend', 10);
    store.upsertKpi('2026-10-10', 'meta', 'spend', 12);
    expect(store.kpis('2026-10-01', '2026-10-31')).toEqual([{ date: '2026-10-10', channel: 'meta', metric: 'spend', value: 12 }]);
    const now = new Date(2026, 9, 11).getTime();
    store.addCost({ kind: 'llm', provider: 'deepseek', usd: 0.5, ts: now });
    store.addCost({ kind: 'llm', provider: 'deepseek', usd: 9, ts: new Date(2026, 8, 30).getTime() });
    expect(store.monthToDateUsd(now)).toBe(0.5);
    store.close();
  });
});

describe('kpi snapshot', () => {
  it('sums Meta, Google and GA4 for the date and survives one provider failing', async () => {
    const store = new TrackingStore(tmp());
    const read = vi.fn(async (tool: string) => {
      if (tool === 'meta_ads_list_accounts') return { data: [{ id: 'act_1', currency: 'INR' }] };
      if (tool === 'meta_ads_insights') return { data: [{ spend: '100', impressions: '1000', clicks: '50', actions: [{ action_type: 'lead', value: '4' }, { action_type: 'onsite_conversion.lead_grouped', value: '4' }] }] };
      if (tool === 'google_ads_search') return { results: [{ customer: { currencyCode: 'INR' }, metrics: { costMicros: '60000000', impressions: '500', clicks: '20', conversions: 2 } }] };
      throw new Error('ga4 quota');
    });
    const r = await snapshotKpis(store, read, { meta: ['1'], google: ['2'], ga4: ['3'] }, '2026-10-10');
    expect(r).toMatchObject({ errors: ['ga4 3: ga4 quota'], allFailed: false });
    const rows = Object.fromEntries(store.kpis('2026-10-10', '2026-10-10').map(k => [`${k.channel}.${k.metric}`, k.value]));
    expect(rows).toMatchObject({ 'meta.spend': 100, 'meta.leads': 4, 'google.spend': 60, 'all.spend': 160, 'all.leads': 6 });
    expect(rows['all.cpl']).toBeCloseTo(26.67, 1);
    expect(store.totals('2026-10-10', '2026-10-10')).toMatchObject({ spend: 160, leads: 6, cpl: 160 / 6 });
    store.close();
  });

  it('falls back to lead sub-types when the aggregate is absent', () => {
    expect(metaLeads([{ action_type: 'onsite_conversion.lead_grouped', value: '2' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '3' }])).toBe(5);
  });

  it('tracks purchases and revenue, and counts Google conversions toward the purchase goal', async () => {
    const store = new TrackingStore(tmp());
    const read = vi.fn(async (tool: string) => {
      if (tool === 'meta_ads_list_accounts') return { data: [{ id: 'act_1', currency: 'INR' }] };
      if (tool === 'meta_ads_insights') return { data: [{ spend: '100', actions: [{ action_type: 'purchase', value: '3' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' }], action_values: [{ action_type: 'purchase', value: '450' }] }] };
      return { results: [{ customer: { currencyCode: 'INR' }, metrics: { costMicros: '50000000', conversions: 1, conversionsValue: 150 } }] };
    });
    await snapshotKpis(store, read, { meta: ['1'], google: ['2'] }, '2026-10-10', 'purchase');
    const rows = Object.fromEntries(store.kpis('2026-10-10', '2026-10-10').map(k => [`${k.channel}.${k.metric}`, k.value]));
    expect(rows).toMatchObject({ 'meta.purchases': 3, 'meta.revenue': 450, 'google.purchases': 1, 'all.purchases': 4, 'all.revenue': 600, 'all.spend': 150 });
    expect(rows['google.leads']).toBeUndefined();
    expect(metaPurchases([{ action_type: 'onsite_web_purchase', value: '2' }])).toBe(2);
    expect(metaPurchaseValue(undefined)).toBe(0);
    store.close();
  });

  it('rejects mixed currencies before writing any daily totals, including across restarts', async () => {
    const dir = tmp();
    let store = new TrackingStore(dir);
    const read = async (tool: string) => tool === 'meta_ads_list_accounts'
      ? { data: [{ id: 'act_1', currency: 'INR' }] }
      : tool === 'google_ads_search' ? { results: [{ customer: { currencyCode: 'USD' }, metrics: { costMicros: '1000000' } }] }
      : { data: [{ spend: '100' }] };
    try {
      await expect(snapshotKpis(store, read, { meta: ['1'], google: ['2'] }, '2026-10-10')).rejects.toThrow('Mixed account currencies');
      expect(store.kpis('2026-10-10', '2026-10-10')).toEqual([]);
      await snapshotKpis(store, read, { meta: ['1'] }, '2026-10-10');
      store.close(); store = new TrackingStore(dir);
      await expect(snapshotKpis(store, read, { google: ['2'] }, '2026-10-11')).rejects.toThrow('Tracking currency is INR');
      expect(store.kpis('2026-10-11', '2026-10-11')).toEqual([]);
    } finally { store.close(); }
  });
});

describe('budget guard', () => {
  it('refuses non-essential calls at 100% but lets essential ones through', async () => {
    process.env.LLM_MONTHLY_BUDGET_USD = '10';
    setLlmSpendSource(() => 10);
    const providers = [{ name: 'deepseek', url: 'https://ds', key: 'k', model: 'm' }];
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] })));
    await expect(chat({ messages: [], purpose: 'blog' }, { fetch: f as any, providers })).rejects.toBeInstanceOf(LlmBudgetError);
    await expect(chat({ messages: [], purpose: 'approval', essential: true }, { fetch: f as any, providers })).resolves.toMatchObject({ provider: 'deepseek' });
  });
});

describe('server activity tracking', () => {
  it('records client logins, ads transitions and LLM cost', async () => {
    const dir = tmp();
    const server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
    const port = await server.start();
    try {
      const base = `http://127.0.0.1:${port}`;
      await fetch(base + '/api/core/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'client', password: 'correct horse battery staple' }) });
      await fetch(base + '/api/core/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'client', password: 'correct horse battery staple' }) });
      VisualizationEventBus.getInstance().emitEvent({ type: 'ADS_OPERATION_CHANGED', operationId: 'op-9', tool: 'ads_launch_meta', status: 'VERIFIED', timestamp: Date.now() });
      await chat({ messages: [], purpose: 'test' }, { providers: [{ name: 'openrouter', url: 'https://or', key: 'k', model: 'm' }],
        fetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }], usage: { cost: 0.02 } }))) as any });
      const types = server.tracking.activity().map(a => a.type);
      expect(types).toEqual(expect.arrayContaining(['login', 'ads.verified', 'milestone.done']));
      expect(server.tracking.summary()).toMatchObject({ costMonthToDateUsd: 0.02 });
      expect(server.tracking.summary().lastLogin).toBeTypeOf('number');
    } finally { await server.stop(); }
  });
});
