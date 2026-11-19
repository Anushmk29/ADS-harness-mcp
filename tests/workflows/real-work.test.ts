import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDepartment } from '../../src/departments/runtime.js';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { TrackingStore } from '../../src/core/tracking/store.js';
import { buildReport, reportPeriod } from '../../src/core/tracking/reports.js';
import { checkFatigue } from '../../src/modules/ads/fatigue.js';
import { resetLlmHealth } from '../../src/core/llm/index.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'real-work-'));

beforeEach(() => { vi.stubEnv('DEEPSEEK_API_KEY', 'k'); vi.stubEnv('DEEPSEEK_MODEL', 'm'); MemoryManager.resetInstance(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetLlmHealth(); MemoryManager.resetInstance(); });

describe('reports and fatigue', () => {
  it('builds a weekly report from kpi_daily with week-over-week change and ticks the milestone', () => {
    const store = new TrackingStore(tmp());
    const now = new Date(2026, 9, 12, 9).getTime();             // Monday
    const p = reportPeriod('weekly', now);
    expect([p.since, p.until]).toEqual(['2026-10-05', '2026-10-11']);
    store.upsertKpi('2026-10-06', 'all', 'spend', 200); store.upsertKpi('2026-10-06', 'all', 'leads', 10);
    store.upsertKpi('2026-09-30', 'all', 'spend', 100); store.upsertKpi('2026-09-30', 'all', 'leads', 10);
    const { report } = buildReport(store, 'weekly', now);
    expect(report.headline).toContain('Ad spend 200 (+100%)');
    expect(report.totals.cpl).toBe(20);
    expect(store.milestones().find(m => m.id === 'first-weekly-report')?.status).toBe('done');
    expect(store.reports()).toHaveLength(1);
    store.close();
  });

  it('reports purchases, cost per purchase and ROAS for a purchase-goal client', () => {
    const store = new TrackingStore(tmp());
    const now = new Date(2026, 9, 12, 9).getTime();
    for (const day of ['2026-10-06', '2026-10-07']) {
      store.upsertKpi(day, 'all', 'spend', 100); store.upsertKpi(day, 'all', 'purchases', 2); store.upsertKpi(day, 'all', 'revenue', 300); store.upsertKpi(day, 'all', 'roas', 3);
    }
    const { report } = buildReport(store, 'weekly', now, { goal: 'purchase', targets: { roas: 2.5 } });
    expect(report.headline).toContain('4 purchases');
    expect(report.headline).toContain('cost per purchase 50');
    expect(report.headline).toContain('ROAS 3');
    expect(report.totals).toMatchObject({ cpa: 50, roas: 3 });
    expect(report.channels.all.roas).toBeUndefined(); // daily ratios are never summed
    store.close();
  });

  it('proposes (never performs) a pause for a fatigued ad', async () => {
    const now = new Date(2026, 9, 12).getTime();
    const read = vi.fn(async (_tool: string, args: any) => ({ data: [args.since === '2026-09-28'
      ? { ad_id: '9', ad_name: 'Old ad', impressions: '10000', clicks: '300', spend: '100', actions: [{ action_type: 'lead', value: '20' }] }
      : { ad_id: '9', ad_name: 'Old ad', impressions: '10000', clicks: '100', spend: '200', actions: [{ action_type: 'lead', value: '10' }] }] }));
    const propose = vi.fn(async () => ({ id: 'fatigue-9', status: 'PENDING_APPROVAL' }));
    const r = await checkFatigue(read, propose, '123', { now });
    expect(r.fatigued).toHaveLength(1);
    expect(propose).toHaveBeenCalledWith('meta_ads_update_ad', expect.objectContaining({ objectId: '9', data: { status: 'PAUSED' } }));
    expect(r.fatigued[0].proposal).toMatchObject({ status: 'PENDING_APPROVAL', operationId: 'fatigue-9' });
  });
});
