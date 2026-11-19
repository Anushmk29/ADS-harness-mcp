import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrackingStore } from '../../src/core/tracking/store.js';
import { buildReport } from '../../src/core/tracking/reports.js';
import { inventedNumbers, allowedNumbers, templateNarrative, writeNarrative } from '../../src/core/tracking/report-writer.js';
import { renderReportHtml } from '../../src/core/tracking/report-html.js';
import { runRules, type Row } from '../../src/modules/ads/findings.js';
import { rankActions } from '../../src/modules/ads/actions.js';
import { latestReview } from '../../src/departments/scheduler.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'report-writer-'));
const row = (level: Row['level'], id: string, m: Partial<Row> = {}): Row => ({ level, id, name: `${level} ${id}`, spend: 0, impressions: 0, clicks: 0, results: 0, revenue: 0, ...m });

/** A full week with no LLM: snapshot rows -> rules -> ranked actions -> report with template wording. */
function weekWithoutLlm() {
  const store = new TrackingStore(tmp());
  const now = new Date(2026, 10, 16, 9).getTime(); // Monday 16 Nov 2026 -> week 9..15 Nov
  for (let d = 9; d <= 15; d++) { const day = `2026-11-${String(d).padStart(2, "0")}`; store.upsertKpi(day, "all", "spend", 200); store.upsertKpi(day, "all", "purchases", 1); store.upsertKpi(day, "all", "revenue", 300); }
  const input = { accountId: '1', since: '2026-11-09', until: '2026-11-15', days: 7, baseline: [],
    current: [row('account', '1', { spend: 1400, results: 7, revenue: 2100, clicks: 420, impressions: 30000 }), row('adset', 'dead', { name: 'Broad 18-65', spend: 700 }), row('adset', 'ok', { spend: 700, results: 7, revenue: 2100, dailyBudget: 100 }), row('campaign', 'c1', { name: 'Sales', spend: 1400, results: 7, revenue: 2100 })] };
  const settings = { goal: 'purchase' as const, targets: { cpa: 150, roas: 2 } };
  const { findings, dataStatus } = runRules(input, settings);
  const review = { period: { since: input.since, until: input.until, days: 7 }, dataStatus, findings, actions: rankActions(findings, input), campaigns: [{ id: 'c1', name: 'Sales', spend: 1400, results: 7, revenue: 2100, costPerResult: 200 }] };
  const { report } = buildReport(store, 'weekly', now, { ...settings, review, pendingApprovals: 1 });
  store.close();
  return report;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('report without any LLM', () => {
  it('builds findings, next steps and template wording from the numbers alone', () => {
    const report = weekWithoutLlm();
    expect(report.findings[0]).toMatchObject({ rule: 'kill_no_results', entity: { id: 'dead' } });
    expect(report.actions[0]).toMatchObject({ title: 'Pause adset "Broad 18-65"' });
    expect(report.vsTarget).toEqual({ cpa: { value: 200, target: 150, met: false }, roas: { value: 1.5, target: 2, met: false } });
    expect(report.narrative.source).toBe('template');
    expect(report.narrative.summary).toContain('Cost per purchase (200) is above the 150 target');
    expect(report.narrative.points.some((p: string) => p.startsWith('Next: Pause'))).toBe(true);
  });

  it('writeNarrative falls back to the template when no model is configured', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', ''); vi.stubEnv('OPENROUTER_API_KEY', '');
    const n = await writeNarrative(weekWithoutLlm());
    expect(n.source).toBe('template');
    expect(n.rejected).toContain('No LLM configured');
  });
});

describe('model wording is checked against the data', () => {
  const reply = (content: object) => vi.fn(async () => ({ message: { content: JSON.stringify(content) }, costUsd: 0, provider: 'deepseek', model: 'm' }));

  it('accepts wording that only uses numbers from the report', async () => {
    const chat = reply({ summary: 'You spent 1,400 for 7 purchases, so each cost 200 against a 150 target.', points: ['Pause Broad 18-65: it spent 700 with no sales.'] });
    const n = await writeNarrative(weekWithoutLlm(), { chat });
    expect(n).toMatchObject({ source: 'llm', model: 'deepseek/m' });
  });

  it('rejects wording with an invented number and keeps the template', async () => {
    const chat = reply({ summary: 'Sales rose 37% and ROAS hit 4.2 this week.', points: [] });
    const n = await writeNarrative(weekWithoutLlm(), { chat });
    expect(n.source).toBe('template');
    expect(n.rejected).toMatch(/37.*4\.2/);
  });

  it('rejects malformed output and model failures', async () => {
    expect((await writeNarrative(weekWithoutLlm(), { chat: vi.fn(async () => ({ message: { content: 'not json' }, costUsd: 0, provider: 'p', model: 'm' })) })).source).toBe('template');
    expect((await writeNarrative(weekWithoutLlm(), { chat: vi.fn(async () => { throw new Error('All LLM providers failed'); }) })).rejected).toContain('All LLM providers failed');
  });

  it('number check ignores thousands separators and allows rounding and small counts', () => {
    const allowed = allowedNumbers({ spend: 1400.456, label: 'week of 2026-11-09' });
    expect(inventedNumbers('spent 1,400.46 (about 1400) on 3 ads since 2026-11-09', allowed)).toEqual([]);
    expect(inventedNumbers('spent 1,500', allowed)).toEqual(['1500']);
  });
});

describe('report page', () => {
  it('renders a branded, escaped, printable page with findings and campaigns', () => {
    const report = weekWithoutLlm();
    report.findings[0].entity.name = '<script>alert(1)</script>';
    const html = renderReportHtml(report, { name: 'Acme Shoes', logoUrl: 'javascript:alert(1)', accent: 'red;}</style>' });
    expect(html).toContain('Weekly ads report · Acme Shoes');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('--accent:#2457d6');
    expect(html).toContain('What we found');
    expect(html).toContain('needs your approval');
    expect(html).toContain('<td>Sales</td>');
    expect(html).toContain('ROAS');
  });

  it('template narrative handles a report with no data', () => {
    expect(templateNarrative({ goal: 'lead', headline: '0 ad change(s) applied', totals: {}, findings: [], dataStatus: 'INSUFFICIENT' }).summary).toContain('Not enough leads yet');
  });
});

describe('latestReview', () => {
  it('prefers reviews ending on the report day and merges several accounts', () => {
    const a = { accountId: '1', period: { until: '2026-11-15' }, dataStatus: 'OK', findings: [{ severity: 'low' }], actions: [{ score: 1 }], campaigns: [{ spend: 5 }] };
    const b = { accountId: '2', period: { until: '2026-11-15' }, dataStatus: 'OK', findings: [{ severity: 'critical' }], actions: [{ score: 9 }], campaigns: [{ spend: 50 }] };
    const old = { accountId: '1', period: { until: '2026-11-08' }, findings: [], actions: [] };
    const merged = latestReview([a, b, old], '2026-11-15');
    expect(merged.accountId).toBe('1,2');
    expect(merged.findings[0].severity).toBe('critical');
    expect(merged.actions.map((x: any) => x.rank)).toEqual([1, 2]);
    expect(latestReview([old], '2026-11-15')).toBe(old);
    expect(latestReview([], '2026-11-15')).toBeUndefined();
  });
});
