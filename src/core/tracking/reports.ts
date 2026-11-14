import type { TrackingStore } from './store.js';

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
export function buildReport(store: TrackingStore, kind: ReportKind, now = Date.now()) {
  const p = reportPeriod(kind, now);
  const cur = store.totals(p.since, p.until), prev = store.totals(p.prevSince, p.prevUntil);
  const channels: Record<string, Record<string, number>> = {};
  for (const k of store.kpis(p.since, p.until)) (channels[k.channel] ??= {})[k.metric] = (channels[k.channel][k.metric] ?? 0) + k.value;
  const all = channels.all ?? {}, prevAll: Record<string, number> = {};
  for (const k of store.kpis(p.prevSince, p.prevUntil, 'all')) prevAll[k.metric] = (prevAll[k.metric] ?? 0) + k.value;
  const cpl = all.leads ? (all.spend ?? 0) / all.leads : null, prevCpl = prevAll.leads ? (prevAll.spend ?? 0) / prevAll.leads : null;

  const activity = store.activity({ since: p.startMs, limit: 1000 }).filter(a => a.ts <= p.endMs);
  const count = (type: string) => activity.filter(a => a.type === type).length;
  const work = {
    approvalsRequested: count('ads.pending'),
    adChangesApplied: count('ads.verified'), adChangesDeclined: count('ads.rejected'), milestonesReached: activity.filter(a => a.type === 'milestone.done').map(a => a.summary)
  };
  const headline = [
    all.spend !== undefined ? `Ad spend ${fmt(all.spend)}${pct(all.spend, prevAll.spend ?? 0) !== null ? ` (${pct(all.spend, prevAll.spend!)! >= 0 ? '+' : ''}${pct(all.spend, prevAll.spend!)}%)` : ''}` : null,
    all.leads !== undefined ? `${fmt(all.leads)} leads${pct(all.leads, prevAll.leads ?? 0) !== null ? ` (${pct(all.leads, prevAll.leads!)! >= 0 ? '+' : ''}${pct(all.leads, prevAll.leads!)}%)` : ''}` : null,
    cpl !== null ? `cost per lead ${fmt(cpl)}` : null,
    cur.sessions !== undefined ? `${fmt(cur.sessions)} website sessions` : null,
    `${work.adChangesApplied} ad change(s) applied`
  ].filter(Boolean).join(' · ');

  const report = {
    kind, period: p.label, since: p.since, until: p.until, generatedAt: new Date(now).toISOString(), headline,
    totals: { current: all, previous: prevAll, cpl, previousCpl: prevCpl, sessions: cur.sessions ?? null, conversions: cur.conversions ?? null },
    channels, work, milestones: store.milestones().map(m => ({ title: m.title, status: m.status })),
    dataNote: Object.keys(channels).length ? 'Numbers are what each platform reported; platforms count conversions differently.' : 'No ad or analytics data was recorded for this period yet.'
  };
  const id = store.saveReport(p.label, kind, report, now);
  store.log('system', `report.${kind}`, `${kind === 'weekly' ? 'Weekly' : 'Monthly'} report ready (${p.since} to ${p.until})`, id, now);
  return { id, report };
}
