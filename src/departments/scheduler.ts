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
import { buildReport } from '../core/tracking/reports.js';

const DAY = 86_400_000;
const KEEP_LOCAL_BACKUPS = 7;

/** Next occurrence of hh:mm in the process timezone (set TZ per client). */
export function nextLocal(hour: number, minute = 0, now = Date.now(), weekday?: number): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  while (d.getTime() <= now || (weekday !== undefined && d.getDay() !== weekday)) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function defaultSystemHandlers(root: string): SystemHandlers {
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
        const result = await snapshotKpis(tracking, read, ads.configuredAccounts(), typeof input.date === 'string' ? input.date : undefined);
        if (result.errors.length) await alert(result.allFailed ? 'critical' : 'warn', 'kpi-snapshot', result.errors.join(' | '));
        return { status: result.allFailed ? 'FAILED' : 'COMPLETED', error: result.allFailed ? result.errors.join(' | ') : undefined, ...result };
      } finally { ads.close(); tracking.close(); }
    },
    async report(input) {
      const kind = input.kind === 'monthly' ? 'monthly' : 'weekly';
      // Monthly runs on a daily slot and only acts on the 1st (months have no fixed interval).
      if (kind === 'monthly' && new Date().getDate() !== 1) return { status: 'COMPLETED', skipped: 'not the 1st' };
      const tracking = new TrackingStore(join(root, 'tracking'));
      try { const { id, report } = buildReport(tracking, kind); return { status: 'COMPLETED', reportId: id, headline: report.headline }; }
      finally { tracking.close(); }
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
        for (const accountId of accounts) results.push(await checkFatigue(call, call, accountId));
        const fatigued = results.flatMap(r => r.fatigued);
        if (fatigued.length) await alert('info', 'ads-fatigue', `${fatigued.length} ad(s) show creative fatigue; pause proposals are waiting for client approval`);
        return { status: 'COMPLETED', accounts: accounts.length, fatigued: fatigued.map(f => ({ adId: f.adId, adName: f.adName, proposal: f.proposal })) };
      } finally { ads.close(); }
    },
    async doctor() {
      const checks = await runDoctor({ live: true });
      const fails = checks.filter(c => c.level === 'fail');
      for (const c of fails) await alert('critical', `doctor:${c.name}`, c.detail);
      return { status: 'COMPLETED', fails: fails.map(c => `${c.name}: ${c.detail}`) };
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
