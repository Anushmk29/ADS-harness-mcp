import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DepartmentJobs, RETRY_BACKOFF_MS, STALE_RUNNING_MS } from '../../src/departments/jobs.js';
import { Scheduler, nextLocal } from '../../src/departments/scheduler.js';
import { alert, resetAlertDedup } from '../../src/observability/alerts.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'sched-'));
afterEach(() => { delete process.env.ALERT_TELEGRAM_BOT_TOKEN; delete process.env.ALERT_TELEGRAM_CHAT_ID; resetAlertDedup(); });

describe('job store reliability', () => {
  it('does not claim a stale selection after another worker has rescheduled the job', async () => {
    const dir = tmp();
    const first = new DepartmentJobs(dir), second = new DepartmentJobs(dir);
    first.add({ id: 'a', department: 'system', capability: 'wait', nextRunAt: 0, intervalMs: 60_000 });
    first.add({ id: 'b', department: 'system', capability: 'count', nextRunAt: 0, intervalMs: 60_000 });
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const count = vi.fn(async () => ({ status: 'COMPLETED' }));
    const handlers = { wait: async () => { entered(); await blocked; return { status: 'COMPLETED' }; }, count };
    try {
      const running = first.runDue({}, 100, handlers);
      await started;
      await second.runDue({}, 100, handlers);
      release(); await running;
      expect(count).toHaveBeenCalledTimes(1);
      expect(first.list().find(job => job.id === 'b')?.nextRunAt).toBe(60_000);
    } finally { release(); first.close(); second.close(); }
  });

  it('recovers a job stuck in RUNNING and then completes it once', async () => {
    const dir = tmp();
    const jobs = new DepartmentJobs(dir);
    jobs.add({ id: 'x', department: 'system', capability: 'ok', nextRunAt: 0 });
    const db = new DatabaseSync(join(dir, 'jobs.sqlite'));
    db.prepare("UPDATE jobs SET state='RUNNING', updated_at=0").run(); db.close();   // process died mid-run
    const ok = vi.fn(async () => ({ status: 'COMPLETED' }));
    expect(await jobs.runDue({}, 1000, { ok })).toEqual([]);                        // RUNNING is not picked up
    expect(jobs.recoverStale(STALE_RUNNING_MS + 1)).toBe(1);
    expect(await jobs.runDue({}, STALE_RUNNING_MS + 2, { ok })).toHaveLength(1);
    expect(await jobs.runDue({}, STALE_RUNNING_MS + 3, { ok })).toEqual([]);
    expect(ok).toHaveBeenCalledTimes(1);
    jobs.close();
  });

  it('retries FAILED with backoff, then marks a one-off job DEAD', async () => {
    const jobs = new DepartmentJobs(tmp());
    jobs.add({ id: 'flaky', department: 'system', capability: 'boom', nextRunAt: 0 });
    const boom = async () => ({ status: 'FAILED', error: 'provider down' });
    let now = 0;
    for (const wait of RETRY_BACKOFF_MS) {
      const [r] = await jobs.runDue({}, now, { boom });
      expect(r).toMatchObject({ status: 'FAILED', dead: false });
      expect(await jobs.runDue({}, now + wait - 1, { boom })).toEqual([]);             // not before the backoff
      now += wait;
    }
    const [last] = await jobs.runDue({}, now, { boom });
    expect(last.dead).toBe(true);
    expect(jobs.list()[0]).toMatchObject({ state: 'DEAD', lastError: 'provider down' });
    jobs.resume('flaky', now);
    expect(jobs.list()[0]).toMatchObject({ state: 'READY', attempts: 0 });
    jobs.close();
  });

  it('keeps a recurring job going after PENDING_APPROVAL, without drift', async () => {
    const jobs = new DepartmentJobs(tmp());
    jobs.add({ id: 'weekly', department: 'system', capability: 'needs', nextRunAt: 1000, intervalMs: 60_000 });
    await jobs.runDue({}, 5000, { needs: async () => ({ status: 'PENDING_APPROVAL' }) });
    expect(jobs.list()[0]).toMatchObject({ state: 'READY', nextRunAt: 61_000 });
    jobs.close();
  });
});

describe('scheduler', () => {
  it('alerts once (deduped) on Telegram when a job dies', async () => {
    process.env.ALERT_TELEGRAM_BOT_TOKEN = 'bot-token'; process.env.ALERT_TELEGRAM_CHAT_ID = '42';
    const hook = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', hook);
    try {
      const scheduler = new Scheduler({ storageDir: tmp(), jobs: [], handlers: { boom: async () => ({ status: 'FAILED', error: 'nope' }) } });
      scheduler.jobs.add({ id: 'once', department: 'system', capability: 'boom', nextRunAt: 0 });
      let now = 0;
      for (const wait of [0, ...RETRY_BACKOFF_MS]) { now += wait; await scheduler.tick(now); }
      expect(hook).toHaveBeenCalledTimes(1);
      expect((hook.mock.calls[0] as any)[0]).toBe('https://api.telegram.org/botbot-token/sendMessage');
      const body = JSON.parse((hook.mock.calls[0] as any)[1].body);
      expect(body.chat_id).toBe('42');
      expect(body.text).toContain('🔴');
      expect(body.text).toContain('job-dead:once');
      expect(scheduler.alive(now)).toBe(true);
      scheduler.stop();
    } finally { vi.unstubAllGlobals(); }
  });

  it('dedupes alerts by key for 6h', async () => {
    process.env.ALERT_TELEGRAM_BOT_TOKEN = 'bot-token'; process.env.ALERT_TELEGRAM_CHAT_ID = '42';
    const f = vi.fn(async () => new Response('ok')) as any;
    expect(await alert('warn', 'k', 'm', { fetch: f, now: 0 })).toBe(true);
    expect(await alert('warn', 'k', 'm', { fetch: f, now: 3_600_000 })).toBe(false);
    expect(await alert('warn', 'k', 'm', { fetch: f, now: 7 * 3_600_000 })).toBe(true);
  });

  it('computes the next local slot', () => {
    const now = new Date(2026, 9, 11, 7, 0).getTime();
    expect(new Date(nextLocal(6, 0, now)).getDate()).toBe(12);
    expect(new Date(nextLocal(8, 0, now)).getDate()).toBe(11);
    expect(new Date(nextLocal(9, 0, now, 1)).getDay()).toBe(1);
  });
});
