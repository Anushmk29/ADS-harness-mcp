// Operator view of one client deployment: the same JSON feeds /api/ops/summary, the weekly digest and fleet-status.
import type { TrackingStore } from '../core/tracking/store.js';
import { localDate } from '../core/tracking/kpi-snapshot.js';

export interface PendingItem { kind: string; id: string; title: string; createdAt: number }
export interface JobRow { id: string; state: string; attempts?: number; lastError?: string | null; result?: any; nextRunAt?: number }

const HOUR = 3_600_000;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const change = (cur?: number, prev?: number) => (cur === undefined || !prev ? null : Math.round(((cur - prev) / prev) * 100));

/** Median hours from "approval requested" to the client's decision, over the last 30 days (matched by activity ref). */
export function approvalResponseHours(tracking: TrackingStore, now = Date.now()): number | null {
  const events = tracking.activity({ since: now - 30 * 24 * HOUR, limit: 5000 }).reverse();
  const asked = new Map<string, number>(), waits: number[] = [];
  for (const e of events) {
    if (!e.ref) continue;
    if (e.type === 'ads.pending') asked.set(e.ref, e.ts);
    else if (/^ads\.(approved|rejected)$/.test(e.type) && asked.has(e.ref)) { waits.push((e.ts - asked.get(e.ref)!) / HOUR); asked.delete(e.ref); }
  }
  const m = median(waits);
  return m === null ? null : Math.round(m * 10) / 10;
}

export function opsSummary(input: { tracking: TrackingStore; jobs: JobRow[]; pending: PendingItem[]; now?: number; client?: string }) {
  const now = input.now ?? Date.now(), { tracking, jobs, pending } = input;
  const summary = tracking.summary(now);
  const budget = Number(process.env.LLM_MONTHLY_BUDGET_USD) || null;
  const cur = tracking.totals(localDate(-7, now), localDate(-1, now)), prev = tracking.totals(localDate(-14, now), localDate(-8, now));
  const doctor = jobs.find(j => j.id === 'doctor-daily')?.result;
  const oldest = pending.reduce<number | null>((min, p) => (min === null || p.createdAt < min ? p.createdAt : min), null);
  return {
    client: input.client ?? process.env.APP_NAME ?? process.env.CLIENT_DOMAIN ?? 'client',
    generatedAt: new Date(now).toISOString(),
    cost: { monthToDateUsd: summary.costMonthToDateUsd, budgetUsd: budget, budgetPct: budget ? Math.round((summary.costMonthToDateUsd / budget) * 100) : null,
      breakdown: tracking.costBreakdown(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime()) },
    jobs: { dead: jobs.filter(j => j.state === 'DEAD').map(j => ({ id: j.id, error: j.lastError })),
      retrying: jobs.filter(j => j.state === 'READY' && (j.attempts ?? 0) > 0).map(j => ({ id: j.id, attempts: j.attempts, error: j.lastError })),
      paused: jobs.filter(j => j.state === 'PAUSED').map(j => j.id) },
    approvals: { waiting: pending.length, oldestHours: oldest === null ? null : Math.round((now - oldest) / HOUR), medianResponseHours: approvalResponseHours(tracking, now),
      over48h: pending.filter(p => now - p.createdAt > 48 * HOUR).map(p => ({ kind: p.kind, id: p.id, title: p.title })) },
    client_activity: { lastLogin: summary.lastLogin ? new Date(summary.lastLogin).toISOString() : null, lastAction: summary.lastClientAction ? new Date(summary.lastClientAction).toISOString() : null },
    milestones: { pct: summary.milestonePct, next: summary.nextMilestone?.title ?? null, waitingOn: summary.nextMilestone?.owner ?? null },
    kpis: { thisWeek: cur, lastWeek: prev, change: { spend: change(cur.spend, prev.spend), leads: change(cur.leads, prev.leads) } },
    doctor: { fails: Array.isArray(doctor?.fails) ? doctor.fails : [], lastRun: jobs.find(j => j.id === 'doctor-daily')?.result ? 'ok' : 'not yet' }
  };
}
export type OpsSummary = ReturnType<typeof opsSummary>;

/** One line for deploy/fleet-status.sh. */
export function summaryLine(s: OpsSummary): string {
  const flags = [
    s.jobs.dead.length && `${s.jobs.dead.length} dead job(s)`, s.doctor.fails.length && `${s.doctor.fails.length} doctor red`,
    s.approvals.over48h.length && `${s.approvals.over48h.length} approval(s) >48h`, s.cost.budgetPct !== null && s.cost.budgetPct >= 80 && `LLM budget ${s.cost.budgetPct}%`
  ].filter(Boolean);
  const login = s.client_activity.lastLogin ? `login ${Math.round((Date.parse(s.generatedAt) - Date.parse(s.client_activity.lastLogin)) / 86_400_000)}d ago` : 'never logged in';
  return `${flags.length ? 'ATTN ' + flags.join(', ') : 'ok'} | waiting ${s.approvals.waiting} | ${login} | plan ${s.milestones.pct}% | $${s.cost.monthToDateUsd.toFixed(2)} MTD | leads ${s.kpis.thisWeek.leads ?? 0} (${s.kpis.change.leads ?? '-'}%)`;
}

/** Plain-text weekly digest, sent to the operator's Telegram. */
export function digestText(s: OpsSummary): string {
  const lines = [
    `Weekly ops: ${s.client}`,
    `Plan ${s.milestones.pct}%${s.milestones.next ? `, next: ${s.milestones.next} (${s.milestones.waitingOn === 'client' ? 'waiting on client' : 'on us'})` : ''}`,
    `Results 7d: spend ${s.kpis.thisWeek.spend ?? 0} (${s.kpis.change.spend ?? '-'}%), leads ${s.kpis.thisWeek.leads ?? 0} (${s.kpis.change.leads ?? '-'}%)`,
    `Approvals waiting: ${s.approvals.waiting}${s.approvals.oldestHours !== null ? `, oldest ${s.approvals.oldestHours}h` : ''}; client median response ${s.approvals.medianResponseHours ?? '-'}h`,
    `Client last login: ${s.client_activity.lastLogin ?? 'never'}`,
    `LLM cost MTD: $${s.cost.monthToDateUsd.toFixed(2)}${s.cost.budgetUsd ? ` of $${s.cost.budgetUsd} (${s.cost.budgetPct}%)` : ''}`,
    s.jobs.dead.length ? `DEAD jobs: ${s.jobs.dead.map(j => j.id).join(', ')}` : 'Jobs: none dead',
    s.jobs.retrying.length ? `Retrying: ${s.jobs.retrying.map(j => `${j.id} (x${j.attempts})`).join(', ')}` : '',
    s.doctor.fails.length ? `Doctor reds: ${s.doctor.fails.join('; ')}` : s.doctor.lastRun === 'ok' ? 'Doctor: green' : 'Doctor: not run yet'
  ];
  return lines.filter(Boolean).join('\n');
}
