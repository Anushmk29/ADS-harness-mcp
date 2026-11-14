import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createDepartment, type DepartmentOptions } from './runtime.js';
import { departmentIds } from './catalog.js';
import { dataDir } from '../config/paths.js';

const jobSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), department: z.enum([...departmentIds, 'system']),
  capability: z.string().min(1), input: z.record(z.unknown()).default({}), nextRunAt: z.number().int().nonnegative(),
  intervalMs: z.number().int().min(60000).optional() }).strict();
export type DepartmentJob = z.input<typeof jobSchema>;
/** In-process jobs (doctor, backup, reports...) keyed by capability; department 'system' routes here. */
export type SystemHandlers = Record<string, (input: Record<string, unknown>) => Promise<{ status: string; [k: string]: unknown }>>;
export interface JobRunResult { jobId: string; status: string; error?: string; attempts?: number; dead?: boolean; [k: string]: unknown }

export const RETRY_BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000];
export const STALE_RUNNING_MS = 30 * 60_000;

/** Explicit jobs only. Constructing the store never starts a timer or worker. */
export class DepartmentJobs {
  private db: DatabaseSync;
  constructor(directory = dataDir('jobs')) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'jobs.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, due INTEGER, state TEXT, payload TEXT, result TEXT)');
    const columns = new Set((this.db.prepare('PRAGMA table_info(jobs)').all() as any[]).map(c => c.name));
    if (!columns.has('attempts')) this.db.exec('ALTER TABLE jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
    if (!columns.has('last_error')) this.db.exec('ALTER TABLE jobs ADD COLUMN last_error TEXT');
    if (!columns.has('updated_at')) this.db.exec('ALTER TABLE jobs ADD COLUMN updated_at INTEGER');
  }
  /** Insert unless the id exists; used to seed default jobs idempotently on every boot. */
  ensure(input: DepartmentJob) {
    const job = jobSchema.parse(input);
    this.db.prepare("INSERT OR IGNORE INTO jobs (id, due, state, payload, result) VALUES (?, ?, 'READY', ?, NULL)").run(job.id, job.nextRunAt, JSON.stringify(job));
    return job;
  }
  /** PAUSED, DEAD or FAILED -> READY now, attempts reset. */
  resume(id: string, now = Date.now()) {
    const result = this.db.prepare("UPDATE jobs SET state='READY', due=?, attempts=0, last_error=NULL, updated_at=? WHERE id=? AND state IN ('PAUSED','DEAD','FAILED')").run(now, now, id);
    if (!result.changes) throw new Error('Job not found or not paused/dead/failed');
  }
  /** A RUNNING row whose process died (crash, deploy) goes back to READY; write tools reuse the same operationId, so re-running is idempotent. */
  recoverStale(now = Date.now(), staleMs = STALE_RUNNING_MS) {
    return Number(this.db.prepare("UPDATE jobs SET state='READY', attempts=attempts+1, last_error='interrupted while RUNNING', updated_at=? WHERE state='RUNNING' AND COALESCE(updated_at, 0) < ?").run(now, now - staleMs).changes);
  }
  add(input: DepartmentJob) {
    const job = jobSchema.parse(input);
    this.db.prepare("INSERT INTO jobs (id, due, state, payload, result) VALUES (?, ?, 'READY', ?, NULL)").run(job.id, job.nextRunAt, JSON.stringify(job));
    return job;
  }
  list() {
    return this.db.prepare('SELECT * FROM jobs ORDER BY due').all().map((row: any) => ({ ...JSON.parse(row.payload), state: row.state, nextRunAt: row.due, attempts: row.attempts, lastError: row.last_error, result: row.result ? JSON.parse(row.result) : null }));
  }
  pause(id: string) {
    const result = this.db.prepare("UPDATE jobs SET state='PAUSED' WHERE id=? AND state != 'RUNNING'").run(id);
    if (!result.changes) throw new Error('Job not found or currently running');
  }
  /**
   * FAILED is retried after 5m/30m/2h; after the last retry a one-off job is DEAD (result.dead=true, caller alerts).
   * A recurring job never stops: any outcome, including PENDING_APPROVAL and exhausted retries, schedules the next slot (due + interval, no drift).
   */
  async runDue(options: DepartmentOptions = {}, now = Date.now(), system: SystemHandlers = {}): Promise<JobRunResult[]> {
    const rows = this.db.prepare("SELECT * FROM jobs WHERE state='READY' AND due<=? ORDER BY due").all(now);
    const results: JobRunResult[] = [];
    for (const row of rows as any[]) {
      const claimed = this.db.prepare("UPDATE jobs SET state='RUNNING', updated_at=? WHERE id=? AND state='READY' AND due=? AND due<=?").run(now, row.id, row.due, now);
      if (!claimed.changes) continue;
      const job = jobSchema.parse(JSON.parse(row.payload));
      let result: any;
      if (job.department === 'system') {
        const handler = system[job.capability];
        try { result = handler ? await handler(job.input) : { status: 'FAILED', error: `No system handler for ${job.capability}` }; }
        catch (error) { result = { status: 'FAILED', error: error instanceof Error ? error.message : String(error) }; }
      } else {
        const department = createDepartment(job.department, options);
        try {
          const input = { ...job.input };
          const tool = (await department.listTools()).find(t => t.name === job.capability);
          if (tool && 'write' in tool && tool.write) input.operationId = `job-${job.id}-${row.due}`;
          result = await department.run({ capability: job.capability, input, taskId: randomUUID() });
        } catch (error) { result = { status: 'FAILED', error: error instanceof Error ? error.message : String(error) }; }
        finally { await department.close(); }
      }
      const failed = result?.status === 'FAILED';
      const attempts = failed ? row.attempts + 1 : 0;
      const retry = failed && attempts <= RETRY_BACKOFF_MS.length;
      const dead = failed && !retry;
      let state: string, due: number;
      if (retry) { state = 'READY'; due = now + RETRY_BACKOFF_MS[attempts - 1]; }
      else if (job.intervalMs !== undefined) {
        state = 'READY'; due = row.due + job.intervalMs;
        while (due <= now) due += job.intervalMs;
      } else { state = dead ? 'DEAD' : result.status; due = row.due; }
      const error = failed ? String(result.error ?? 'failed') : null;
      this.db.prepare('UPDATE jobs SET state=?, due=?, result=?, attempts=?, last_error=?, updated_at=? WHERE id=?')
        .run(state, due, JSON.stringify(result), dead ? 0 : attempts, error, now, job.id);
      results.push({ jobId: job.id, ...result, attempts, dead });
    }
    return results;
  }
  close() { this.db.close(); }
}
