import fs from 'node:fs';
import { join } from 'node:path';
import { DepartmentJobs, type DepartmentJob, type JobRunResult, type SystemHandlers } from './jobs.js';
import type { DepartmentOptions } from './runtime.js';
import { dataDir } from '../config/paths.js';
import { alert } from '../observability/alerts.js';
import { logger } from '../observability/logger.js';
import { runDoctor } from '../ops/doctor.js';
import { backupDataDir } from '../ops/backup.js';
import { TrackingStore } from '../core/tracking/store.js';
import { snapshotKpis } from '../core/tracking/kpi-snapshot.js';
import { buildReport, reportPeriod } from '../core/tracking/reports.js';
import { writeNarrative } from '../core/tracking/report-writer.js';
import { llmProviders } from '../core/llm/index.js';

const DAY = 86_400_000;
const KEEP_LOCAL_BACKUPS = 7;

/** Next occurrence of hh:mm in the process timezone (set TZ per client). */
export function nextLocal(hour: number, minute = 0, now = Date.now(), weekday?: number): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  while (d.getTime() <= now || (weekday !== undefined && d.getDay() !== weekday)) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * The ads review(s) to put in a report: those whose 7-day window ends on the report's last day, else the newest.
 * Several accounts are merged into one view.
 */
export function latestReview(records: any[], until: string): any | undefined {
  if (!records.length) return undefined;
  const matching = records.filter(r => r.period?.until === until);
  const chosen = matching.length ? matching : [records[0]];
  if (chosen.length === 1) return chosen[0];
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  return { ...chosen[0], accountId: chosen.map(r => r.accountId).join(','), dataStatus: chosen.every(r => r.dataStatus === 'OK') ? 'OK' : 'INSUFFICIENT',
    findings: chosen.flatMap(r => r.findings).sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)),
    actions: chosen.flatMap(r => r.actions).sort((a, b) => b.score - a.score).map((a, i) => ({ ...a, rank: i + 1 })),
    campaigns: chosen.flatMap(r => r.campaigns ?? []).sort((a, b) => b.spend - a.spend) };
}

/** Scheduler and `cli job` runs both go through here, so every harness job lands in the Agent activity log. */
export function defaultSystemHandlers(root: string): SystemHandlers {
  const handlers = systemHandlers(root);
  return Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, async (input: any) => {
    const started = Date.now();
    let result: any, error: string | undefined;
    try { result = await handler(input); return result; }
    catch (e: any) { error = e?.message ?? String(e); throw e; }
    finally {
      try {
        const tracking = new TrackingStore(join(root, 'tracking'));
        try {
          const failed = error !== undefined || result?.status === 'FAILED';
          tracking.logToolCall({ client: 'harness', tool: `job:${name}`, args: input, ok: !failed, durationMs: Date.now() - started, output: result, error: error ?? (failed ? String(result?.error ?? 'failed') : undefined) });
        } finally { tracking.close(); }
      } catch { /* logging must not change the job's outcome */ }
    }
  }])) as SystemHandlers;
}

function systemHandlers(root: string): SystemHandlers {
  return {
    async 'kpi-snapshot'(input) {
      const { AdsService } = await import('../modules/ads/service.js');
      const ads = new AdsService({ storageDir: root });
      const tracking = new TrackingStore(join(root, 'tracking'));
      try {
        const read = async (tool: string, args: Record<string, unknown>) => {
          const r = await ads.call(tool, args);
          if (r.status !== 'COMPLETED') throw new Error(r.error ?? r.status);
          return r.data;
        };
        const result = await snapshotKpis(tracking, read, ads.configuredAccounts(), typeof input.date === 'string' ? input.date : undefined, ads.goalSettings().goal);
        if (result.errors.length) await alert(result.allFailed ? 'critical' : 'warn', 'kpi-snapshot', result.errors.join(' | '));
        return { status: result.allFailed ? 'FAILED' : 'COMPLETED', error: result.allFailed ? result.errors.join(' | ') : undefined, ...result };
      } finally { ads.close(); tracking.close(); }
    },
    async report(input) {
      const kind = input.kind === 'monthly' ? 'monthly' : 'weekly';
      // Monthly runs on a daily slot and only acts on the 1st (months have no fixed interval).
      if (kind === 'monthly' && !input.force && new Date().getDate() !== 1) return { status: 'COMPLETED', skipped: 'not the 1st' };
      const { AdsService } = await import('../modules/ads/service.js');
      const ads = new AdsService({ storageDir: root });
      const tracking = new TrackingStore(join(root, 'tracking'));
      try {
        const now = Date.now();
        const review = latestReview(await ads.call('ads_list_records', { kind: 'findings' }).then(r => r.data ?? []).catch(() => []), reportPeriod(kind, now).until);
        const pendingApprovals = await ads.call('ads_list_operations', { statuses: ['PENDING_APPROVAL'] }).then(r => (r.data ?? []).length).catch(() => undefined);
        const { id, report } = buildReport(tracking, kind, now, { ...ads.goalSettings(), review, pendingApprovals });
        // Model wording is optional and checked against the numbers; the template narrative is already saved.
        if (llmProviders().length) {
          report.narrative = await writeNarrative(report, { businessName: process.env.REPORT_BRAND_NAME || process.env.APP_NAME });
          tracking.saveReport(report.period, kind, report, now);
        }
        return { status: 'COMPLETED', reportId: id, headline: report.headline, narrative: report.narrative.source, findings: report.findings.length };
      } finally { ads.close(); tracking.close(); }
    },
    async 'ads-fatigue'() {
      const { AdsService } = await import('../modules/ads/service.js');
      const { checkFatigue } = await import('../modules/ads/fatigue.js');
      const ads = new AdsService({ storageDir: root });
      try {
        const call = async (tool: string, args: Record<string, unknown>) => {
          const r = await ads.call(tool, args);
          if (r?.status === 'FAILED') throw new Error(r.error ?? 'failed');
          return tool.startsWith('meta_ads_update') ? r : r.data;
        };
        const accounts = ads.configuredAccounts().meta ?? [];
        const results = [];
        for (const accountId of accounts) results.push(await checkFatigue(call, call, accountId, { goal: ads.goalSettings().goal }));
        const fatigued = results.flatMap(r => r.fatigued);
        if (fatigued.length) await alert('info', 'ads-fatigue', `${fatigued.length} ad(s) show creative fatigue; pause proposals are waiting for client approval`);
        return { status: 'COMPLETED', accounts: accounts.length, fatigued: fatigued.map(f => ({ adId: f.adId, adName: f.adName, proposal: f.proposal })) };
      } finally { ads.close(); }
    },
    async 'ads-review'() {
      const { AdsService } = await import('../modules/ads/service.js');
      const { proposeActions } = await import('../modules/ads/actions.js');
      const ads = new AdsService({ storageDir: root });
      try {
        const propose = (tool: string, args: Record<string, unknown>) => ads.call(tool, args);
        const reviews = [], errors: string[] = [], accounts = ads.configuredAccounts().meta ?? [];
        for (const accountId of accounts) {
          try {
            const review = await ads.review(accountId);
            const proposals = await proposeActions(review.actions, propose, review.period.until);
            reviews.push({ accountId, dataStatus: review.dataStatus, findings: review.findings.length, critical: review.findings.filter(f => f.severity === 'critical').length, proposals });
          } catch (e: any) { errors.push(`${accountId}: ${e.message}`); }
        }
        if (errors.length) await alert(errors.length === accounts.length ? 'critical' : 'warn', 'ads-review-failed', errors.join(' | '));
        if (accounts.length && errors.length === accounts.length) return { status: 'FAILED', error: errors.join(' | '), errors };
        const critical = reviews.reduce((n, r) => n + r.critical, 0), pending = reviews.flatMap(r => r.proposals).filter(p => p.status === 'PENDING_APPROVAL').length;
        if (critical || pending) await alert(critical ? 'warn' : 'info', 'ads-review', `Weekly ads review: ${critical} critical finding(s), ${pending} change(s) waiting for approval`);
        return { status: 'COMPLETED', reviews, errors };
      } finally { ads.close(); }
    },
    async 'competitor-watch'() {
      const { AdsService } = await import('../modules/ads/service.js');
      const { researchCompetitor } = await import('../modules/research/competitors.js');
      const ads = new AdsService({ storageDir: root });
      const competitors = ads.competitors(); ads.close();
      if (!competitors.length || !process.env.COMPETITOR_API_KEY) return { status: 'COMPLETED', skipped: !competitors.length ? 'no competitors in ads-module.yaml' : 'COMPETITOR_API_KEY not set' };
      const results = [], errors: string[] = [];
      for (const c of competitors) {
        try {
          const r = await researchCompetitor(c, { root: join(root, 'research'), angles: false });
          results.push({ name: c.name, ads: r.patterns.total, active: r.patterns.active, newAds: r.newSinceLastSnapshot?.count ?? null });
        } catch (e: any) { errors.push(`${c.name}: ${e.message}`); }
      }
      if (errors.length) await alert(errors.length === competitors.length ? 'critical' : 'warn', 'competitor-watch', errors.join(' | '));
      const fresh = results.filter(r => r.newAds);
      if (fresh.length) await alert('info', 'competitor-watch', fresh.map(r => `${r.name}: ${r.newAds} new ad(s)`).join(', '));
      return { status: errors.length === competitors.length ? 'FAILED' : 'COMPLETED', results, errors };
    },
    async doctor() {
      const checks = await runDoctor({ live: true });
      const fails = checks.filter(c => c.level === 'fail');
      for (const c of fails) await alert('critical', `doctor:${c.name}`, c.detail);
      return { status: 'COMPLETED', fails: fails.map(c => `${c.name}: ${c.detail}`) };
    },
    async 'agent-report'() {
      const { saveAgentReport } = await import('../core/tracking/agent-report.js');
      const tracking = new TrackingStore(join(root, 'tracking'));
      try {
        const { id, report } = saveAgentReport(tracking);
        return { status: 'COMPLETED', reportId: id, headline: report.headline, improvements: report.improvements.length };
      } finally { tracking.close(); }
    },
    async backup() {
      const dir = join(root, 'backups');
      const files = backupDataDir(join(dir, new Date().toISOString().slice(0, 10)), root);
      const old = fs.readdirSync(dir).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().slice(0, -KEEP_LOCAL_BACKUPS);
      for (const name of old) fs.rmSync(join(dir, name), { recursive: true, force: true });
      return { status: 'COMPLETED', files: files.length };
    }
  };
}

/** Jobs every client gets; `ensure` keeps existing rows (and their schedule) untouched. */
export function defaultJobs(now = Date.now()): DepartmentJob[] {
  return [
    { id: 'kpi-snapshot-daily', department: 'system', capability: 'kpi-snapshot', nextRunAt: nextLocal(7, 0, now), intervalMs: DAY },
    { id: 'report-weekly', department: 'system', capability: 'report', input: { kind: 'weekly' }, nextRunAt: nextLocal(8, 0, now, 1), intervalMs: 7 * DAY },
    { id: 'report-monthly', department: 'system', capability: 'report', input: { kind: 'monthly' }, nextRunAt: nextLocal(8, 5, now), intervalMs: DAY },
    { id: 'ads-fatigue-weekly', department: 'system', capability: 'ads-fatigue', nextRunAt: nextLocal(9, 0, now, 1), intervalMs: 7 * DAY },
    // Runs before the weekly report (Monday 07:45) so the report carries this week's findings.
    { id: 'competitor-watch-weekly', department: 'system', capability: 'competitor-watch', nextRunAt: nextLocal(6, 30, now, 1), intervalMs: 7 * DAY },
    { id: 'ads-review-weekly', department: 'system', capability: 'ads-review', nextRunAt: nextLocal(7, 45, now, 1), intervalMs: 7 * DAY },
    { id: 'agent-report-weekly', department: 'system', capability: 'agent-report', nextRunAt: nextLocal(8, 15, now, 1), intervalMs: 7 * DAY },
    { id: 'doctor-daily', department: 'system', capability: 'doctor', nextRunAt: nextLocal(6, 0, now), intervalMs: DAY },
    { id: 'backup-nightly', department: 'system', capability: 'backup', nextRunAt: nextLocal(2, 30, now), intervalMs: DAY }
  ];
}

/** Jobs whose handlers come from the running server (VisualizationServer.opsHandlers). */
export function opsJobs(now = Date.now()): DepartmentJob[] {
  return [
    { id: 'ops-digest-weekly', department: 'system', capability: 'ops-digest', nextRunAt: nextLocal(7, 30, now, 1), intervalMs: 7 * DAY },
    { id: 'approval-chaser-daily', department: 'system', capability: 'approval-chaser', nextRunAt: nextLocal(10, 0, now), intervalMs: DAY }
  ];
}

export interface SchedulerOptions {
  storageDir?: string; intervalMs?: number; departments?: DepartmentOptions;
  handlers?: SystemHandlers; jobs?: DepartmentJob[]; onResults?: (results: JobRunResult[]) => void;
}

/**
 * In-process timer over DepartmentJobs. No cross-process lock: the READY->RUNNING claim is an atomic
 * UPDATE, so a concurrent `jobs run-due` can never run the same job twice.
 */
export class Scheduler {
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private store?: DepartmentJobs;
  lastTickAt = 0;
  readonly intervalMs: number;
  private root: string;

  constructor(private options: SchedulerOptions = {}) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.root = options.storageDir ?? dataDir();
  }

  get jobs(): DepartmentJobs { return this.store ??= new DepartmentJobs(join(this.root, 'jobs')); }

  start(): this {
    for (const job of this.options.jobs ?? defaultJobs()) this.jobs.ensure(job);
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    void this.tick();
    return this;
  }

  async tick(now = Date.now()): Promise<JobRunResult[]> {
    if (this.ticking) return [];
    this.ticking = true;
    try {
      const recovered = this.jobs.recoverStale(now);
      if (recovered) logger.warn('Scheduler', `recovered ${recovered} job(s) stuck in RUNNING`);
      const results = await this.jobs.runDue({ storageDir: this.root, ...this.options.departments }, now,
        { ...defaultSystemHandlers(this.root), ...this.options.handlers });
      for (const r of results) {
        if (r.dead) await alert('critical', `job-dead:${r.jobId}`, `job ${r.jobId} failed ${r.attempts ?? ''} times: ${r.error ?? 'unknown error'}`);
        else if (r.status === 'FAILED') logger.warn('Scheduler', `job ${r.jobId} failed (attempt ${r.attempts}), will retry: ${r.error}`);
      }
      this.options.onResults?.(results);
      return results;
    } catch (e: any) {
      await alert('critical', 'scheduler-tick', e.message);
      return [];
    } finally {
      this.ticking = false;
      this.lastTickAt = now;
    }
  }

  alive(now = Date.now()): boolean { return this.lastTickAt > now - 3 * this.intervalMs; }

  stop(): void {
    clearInterval(this.timer);
    this.store?.close();
    this.store = undefined;
  }
}
