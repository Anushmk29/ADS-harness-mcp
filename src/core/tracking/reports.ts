import type { TrackingStore } from './store.js';
import { templateNarrative } from './report-writer.js';

export type ReportKind = 'weekly' | 'monthly';
const iso = (d: Date) => d.toLocaleDateString('en-CA');

/** The last complete period before `now`: previous Mon-Sun week, or previous calendar month (process timezone). */
export function reportPeriod(kind: ReportKind, now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (kind === 'monthly') {
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1), end = new Date(d.getFullYear(), d.getMonth(), 0);
    const prevStart = new Date(d.getFullYear(), d.getMonth() - 2, 1), prevEnd = new Date(d.getFullYear(), d.getMonth() - 1, 0);
    return { label: iso(start).slice(0, 7), since: iso(start), until: iso(end), prevSince: iso(prevStart), prevUntil: iso(prevEnd), startMs: start.getTime(), endMs: end.getTime() + 86_399_999 };
  }
  const daysSinceMonday = (d.getDay() + 6) % 7;
  const end = new Date(d); end.setDate(d.getDate() - daysSinceMonday - 1);
  const start = new Date(end); start.setDate(end.getDate() - 6);
  const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - 6);
  return { label: iso(start), since: iso(start), until: iso(end), prevSince: iso(prevStart), prevUntil: iso(prevEnd), startMs: start.getTime(), endMs: end.getTime() + 86_399_999 };
}

const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : Number(n.toFixed(2)).toString());

/**
 * Deterministic client report from kpi_daily + activity (no LLM, so it always builds).
 * Stored in `reports`, and logging report.<kind> ticks the "first weekly report" milestone.
 */
/** review: the latest ads findings record (AdsService.review) for this period, when one exists. */
export interface ReportGoal { goal?: 'lead' | 'purchase'; targets?: { cpa?: number; roas?: number }; review?: any; pendingApprovals?: number }

export function buildReport(store: TrackingStore, kind: ReportKind, now = Date.now(), settings: ReportGoal = {}) {
  const goal = settings.goal ?? 'lead', resultMetric = goal === 'purchase' ? 'purchases' : 'leads';
  const p = reportPeriod(kind, now);
  const cur = store.totals(p.since, p.until), prev = store.totals(p.prevSince, p.prevUntil);
  const channels: Record<string, Record<string, number>> = {};
  const RATIOS = new Set(['cpl', 'roas']); // per-day ratios cannot be summed; recomputed below
  for (const k of store.kpis(p.since, p.until)) if (!RATIOS.has(k.metric)) (channels[k.channel] ??= {})[k.metric] = (channels[k.channel][k.metric] ?? 0) + k.value;
  const all = channels.all ?? {}, prevAll: Record<string, number> = {};
  for (const k of store.kpis(p.prevSince, p.prevUntil, 'all')) if (!RATIOS.has(k.metric)) prevAll[k.metric] = (prevAll[k.metric] ?? 0) + k.value;
  const cpl = all.leads ? (all.spend ?? 0) / all.leads : null, prevCpl = prevAll.leads ? (prevAll.spend ?? 0) / prevAll.leads : null;
  const costPer = (t: Record<string, number>) => t[resultMetric] ? (t.spend ?? 0) / t[resultMetric] : null;
  const roasOf = (t: Record<string, number>) => t.spend && t.revenue !== undefined ? t.revenue / t.spend : null;
  const cpa = costPer(all), prevCpa = costPer(prevAll), roas = roasOf(all), prevRoas = roasOf(prevAll);
  const change = (cur: number, prev: number | undefined) => { const c = pct(cur, prev ?? 0); return c === null ? '' : ` (${c >= 0 ? '+' : ''}${c}%)`; };

  const activity = store.activity({ since: p.startMs, limit: 1000 }).filter(a => a.ts <= p.endMs);
  const count = (type: string) => activity.filter(a => a.type === type).length;
  const work = {
    approvalsRequested: count('ads.pending'),
    adChangesApplied: count('ads.verified'), adChangesDeclined: count('ads.rejected'), milestonesReached: activity.filter(a => a.type === 'milestone.done').map(a => a.summary)
  };
  const headline = [
    all.spend !== undefined ? `Ad spend ${fmt(all.spend)}${change(all.spend, prevAll.spend)}` : null,
    all[resultMetric] !== undefined ? `${fmt(all[resultMetric])} ${resultMetric}${change(all[resultMetric], prevAll[resultMetric])}` : null,
    cpa !== null ? `cost per ${goal} ${fmt(cpa)}` : null,
    goal === 'purchase' && roas !== null ? `ROAS ${fmt(roas)}` : null,
    cur.sessions !== undefined ? `${fmt(cur.sessions)} website sessions` : null,
    `${work.adChangesApplied} ad change(s) applied`
  ].filter(Boolean).join(' · ');

  const targets = settings.targets ?? {}, review = settings.review;
  const vsTarget = {
    ...(targets.cpa && cpa !== null ? { cpa: { value: cpa, target: targets.cpa, met: cpa <= targets.cpa } } : {}),
    ...(goal === 'purchase' && targets.roas && roas !== null ? { roas: { value: roas, target: targets.roas, met: roas >= targets.roas } } : {})
  };
  const report: Record<string, any> = {
    kind, period: p.label, since: p.since, until: p.until, generatedAt: new Date(now).toISOString(), headline,
    goal, targets, vsTarget,
    // Findings/actions come from the weekly ads review (rules, no LLM); empty when no review ran.
    dataStatus: review?.dataStatus ?? null, reviewPeriod: review?.period ?? null,
    findings: (review?.findings ?? []).slice(0, 5), actions: (review?.actions ?? []).slice(0, 5), campaigns: review?.campaigns ?? [],
    totals: { current: all, previous: prevAll, cpl, previousCpl: prevCpl, cpa, previousCpa: prevCpa, roas, previousRoas: prevRoas, sessions: cur.sessions ?? null, conversions: cur.conversions ?? null },
    channels, work: { ...work, pendingApprovals: settings.pendingApprovals ?? null }, milestones: store.milestones().map(m => ({ title: m.title, status: m.status })),
    dataNote: Object.keys(channels).length ? 'Numbers are what each platform reported; platforms count conversions differently.' : 'No ad or analytics data was recorded for this period yet.'
  };
  report.narrative = templateNarrative(report);
  const id = store.saveReport(p.label, kind, report, now);
  store.log('system', `report.${kind}`, `${kind === 'weekly' ? 'Weekly' : 'Monthly'} report ready (${p.since} to ${p.until})`, id, now);
  return { id, report };
}
