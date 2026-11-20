import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../../config/paths.js';

export type Actor = 'system' | 'client' | 'operator';
export interface Milestone { id: string; title: string; phase: string; owner: 'client' | 'system'; status: 'todo' | 'done'; due: string | null; doneAt: number | null; sort: number }
export interface Activity { id: number; ts: number; actor: Actor; type: string; summary: string; ref: string | null }
export interface ToolCall { id: number; ts: number; client: string; tool: string; args: string | null; ok: boolean; durationMs: number; output: string | null; error: string | null; rating: 1 | -1 | null; note: string | null }

const SECRET_KEY = /token|secret|password|api[_-]?key|authorization|cookie|imageBytes/i;
const CALL_TEXT_LIMIT = 8000;
/** JSON for the call log: secrets and image bytes blanked, long text cut. */
export function callText(value: unknown, limit = CALL_TEXT_LIMIT): string | null {
  if (value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value, (key, v) => key && SECRET_KEY.test(key) ? '[redacted]' : v) ?? null;
  return text && text.length > limit ? `${text.slice(0, limit)}… [${text.length - limit} more chars]` : text;
}
const toCall = (r: any): ToolCall => ({ id: r.id, ts: r.ts, client: r.client, tool: r.tool, args: r.args, ok: !!r.ok, durationMs: r.duration_ms, output: r.output, error: r.error, rating: r.rating, note: r.note });

export interface CostRow { kind: 'llm' | 'apify' | 'transcribe' | 'image'; provider: string; model?: string; units?: number; usd: number; jobId?: string; purpose?: string; ts?: number }

/** Engagement template seeded once per client; `owner` says who the client is waiting on. */
export const MILESTONE_TEMPLATE: Array<Pick<Milestone, 'id' | 'title' | 'phase' | 'owner'>> = [
  { id: 'kickoff', title: 'Kickoff call done', phase: 'Onboarding', owner: 'system' },
  { id: 'access-connected', title: 'Ad accounts and analytics access connected', phase: 'Onboarding', owner: 'client' },
  { id: 'brand-approved', title: 'Brand voice and business details approved', phase: 'Onboarding', owner: 'client' },
  { id: 'first-campaign-live', title: 'First campaign live', phase: 'Launch', owner: 'system' },
  { id: 'first-weekly-report', title: 'First weekly report delivered', phase: 'Launch', owner: 'system' },
  { id: 'month-1-review', title: 'Month-1 review', phase: 'Grow', owner: 'system' }
];

/** Activity types that complete a milestone the first time they happen. */
const AUTO_TICK: Record<string, string> = {
  'ads.verified': 'first-campaign-live',
  'report.weekly': 'first-weekly-report',
  'business.updated': 'brand-approved'
};

/** One tracking.sqlite per client: engagement progress, activity timeline, daily KPIs, costs, stored reports. */
export class TrackingStore {
  private db: DatabaseSync;

  constructor(directory = dataDir('tracking')) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'tracking.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, title TEXT NOT NULL, phase TEXT NOT NULL, owner TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo', due TEXT, done_at INTEGER, sort INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL,
        type TEXT NOT NULL, summary TEXT NOT NULL, ref TEXT);
      CREATE INDEX IF NOT EXISTS activity_ts ON activity(ts);
      CREATE TABLE IF NOT EXISTS kpi_daily (date TEXT NOT NULL, channel TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
        updated_at INTEGER NOT NULL, PRIMARY KEY (date, channel, metric));
      CREATE TABLE IF NOT EXISTS tracking_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS costs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, kind TEXT NOT NULL, provider TEXT NOT NULL,
        model TEXT, units REAL, usd REAL NOT NULL, job_id TEXT, purpose TEXT);
      CREATE INDEX IF NOT EXISTS costs_ts ON costs(ts);
      CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, period TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tool_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, client TEXT NOT NULL, tool TEXT NOT NULL,
        args TEXT, ok INTEGER NOT NULL, duration_ms INTEGER NOT NULL, output TEXT, error TEXT, rating INTEGER, note TEXT);
      CREATE INDEX IF NOT EXISTS tool_calls_ts ON tool_calls(ts);
    `);
    const insert = this.db.prepare('INSERT OR IGNORE INTO milestones (id, title, phase, owner, sort) VALUES (?, ?, ?, ?, ?)');
    MILESTONE_TEMPLATE.forEach((m, i) => insert.run(m.id, m.title, m.phase, m.owner, i));
  }

  // --- milestones ---
  milestones(): Milestone[] {
    return (this.db.prepare('SELECT * FROM milestones ORDER BY sort').all() as any[])
      .map(r => ({ id: r.id, title: r.title, phase: r.phase, owner: r.owner, status: r.status, due: r.due, doneAt: r.done_at, sort: r.sort }));
  }
  completeMilestone(id: string, now = Date.now()): boolean {
    return Number(this.db.prepare("UPDATE milestones SET status='done', done_at=? WHERE id=? AND status!='done'").run(now, id).changes) > 0;
  }
  setMilestone(id: string, fields: { status?: 'todo' | 'done'; due?: string | null }, now = Date.now()) {
    const current = this.milestones().find(m => m.id === id);
    if (!current) throw new Error(`Unknown milestone ${id}`);
    const status = fields.status ?? current.status;
    this.db.prepare('UPDATE milestones SET status=?, due=?, done_at=? WHERE id=?')
      .run(status, fields.due === undefined ? current.due : fields.due, status === 'done' ? current.doneAt ?? now : null, id);
  }

  // --- activity ---
  /** Append to the timeline; a matching first event also ticks its milestone (and logs that too). */
  log(actor: Actor, type: string, summary: string, ref?: string, now = Date.now()): void {
    this.db.prepare('INSERT INTO activity (ts, actor, type, summary, ref) VALUES (?, ?, ?, ?, ?)').run(now, actor, type, summary.slice(0, 500), ref ?? null);
    const milestone = AUTO_TICK[type];
    if (milestone && this.completeMilestone(milestone, now)) {
      const title = this.milestones().find(m => m.id === milestone)?.title ?? milestone;
      this.db.prepare('INSERT INTO activity (ts, actor, type, summary, ref) VALUES (?, ?, ?, ?, ?)').run(now, 'system', 'milestone.done', `Milestone reached: ${title}`, milestone);
    }
  }
  activity(options: { limit?: number; since?: number; actor?: Actor } = {}): Activity[] {
    return this.db.prepare(`SELECT * FROM activity WHERE ts >= ? ${options.actor ? 'AND actor = ?' : ''} ORDER BY ts DESC, id DESC LIMIT ?`)
      .all(...[options.since ?? 0, ...(options.actor ? [options.actor] : []), options.limit ?? 50]) as unknown as Activity[];
  }

  // --- KPIs ---
  ensureCurrency(currency: string): void {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('A confirmed account currency is required');
    this.db.prepare("INSERT OR IGNORE INTO tracking_settings(key,value) VALUES ('currency',?)").run(currency);
    const stored = this.db.prepare("SELECT value FROM tracking_settings WHERE key='currency'").get() as { value: string };
    if (stored.value !== currency) throw new Error(`Tracking currency is ${stored.value}; normalize ${currency} amounts before importing them`);
  }

  /** One row per (date, channel, metric): re-running a day's snapshot replaces it. */
  upsertKpi(date: string, channel: string, metric: string, value: number, now = Date.now()): void {
    if (!Number.isFinite(value)) return;
    this.db.prepare('INSERT INTO kpi_daily (date, channel, metric, value, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(date, channel, metric) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
      .run(date, channel, metric, value, now);
  }
  kpis(since: string, until: string, channel?: string): Array<{ date: string; channel: string; metric: string; value: number }> {
    return this.db.prepare(`SELECT date, channel, metric, value FROM kpi_daily WHERE date BETWEEN ? AND ? ${channel ? 'AND channel = ?' : ''} ORDER BY date, channel, metric`)
      .all(...[since, until, ...(channel ? [channel] : [])]) as any;
  }
  /** Sum underlying channels once; combined rows and ratios are not additive. */
  totals(since: string, until: string): Record<string, number> {
    const rows = this.db.prepare("SELECT metric, SUM(value) AS v FROM kpi_daily WHERE date BETWEEN ? AND ? AND channel != 'all' AND metric != 'cpl' GROUP BY metric").all(since, until) as any[];
    const totals = Object.fromEntries(rows.map(r => [r.metric, r.v]));
    if (totals.leads > 0 && totals.spend !== undefined) totals.cpl = totals.spend / totals.leads;
    return totals;
  }

  // --- costs ---
  addCost(row: CostRow): void {
    this.db.prepare('INSERT INTO costs (ts, kind, provider, model, units, usd, job_id, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.ts ?? Date.now(), row.kind, row.provider, row.model ?? null, row.units ?? null, row.usd, row.jobId ?? null, row.purpose ?? null);
  }
  /** Spend since the 1st of the current month (process timezone). */
  monthToDateUsd(now = Date.now(), kind?: CostRow['kind']): number {
    const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0);
    const row = this.db.prepare(`SELECT COALESCE(SUM(usd), 0) AS usd FROM costs WHERE ts >= ? ${kind ? 'AND kind = ?' : ''}`).get(...[start.getTime(), ...(kind ? [kind] : [])]) as any;
    return row.usd;
  }
  costBreakdown(since: number): Array<{ kind: string; provider: string; usd: number; calls: number }> {
    return this.db.prepare('SELECT kind, provider, SUM(usd) AS usd, COUNT(*) AS calls FROM costs WHERE ts >= ? GROUP BY kind, provider ORDER BY usd DESC').all(since) as any;
  }

  // --- agent / harness tool calls (MCP clients and scheduled jobs) ---
  logToolCall(call: { client: string; tool: string; args?: unknown; ok: boolean; durationMs: number; output?: unknown; error?: string; ts?: number }): number {
    return Number(this.db.prepare('INSERT INTO tool_calls (ts, client, tool, args, ok, duration_ms, output, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(call.ts ?? Date.now(), call.client.slice(0, 80), call.tool.slice(0, 120), callText(call.args), call.ok ? 1 : 0, Math.round(call.durationMs), callText(call.output), call.error?.slice(0, 2000) ?? null).lastInsertRowid);
  }
  toolCalls(filter: { limit?: number; since?: number; client?: string; tool?: string; failed?: boolean; rated?: 1 | -1 } = {}): ToolCall[] {
    const where = ['ts >= ?'], params: any[] = [filter.since ?? 0];
    if (filter.client) { where.push('client = ?'); params.push(filter.client); }
    if (filter.tool) { where.push('tool = ?'); params.push(filter.tool); }
    if (filter.failed !== undefined) { where.push('ok = ?'); params.push(filter.failed ? 0 : 1); }
    if (filter.rated) { where.push('rating = ?'); params.push(filter.rated); }
    return (this.db.prepare(`SELECT * FROM tool_calls WHERE ${where.join(' AND ')} ORDER BY ts DESC, id DESC LIMIT ?`).all(...params, Math.min(filter.limit ?? 100, 1000)) as any[]).map(toCall);
  }
  toolCall(id: number): ToolCall | null {
    const row = this.db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(id);
    return row ? toCall(row) : null;
  }
  /** Operator verdict on one output: 1 useful, -1 wrong, null clears. */
  rateToolCall(id: number, rating: 1 | -1 | null, note?: string): boolean {
    return Number(this.db.prepare('UPDATE tool_calls SET rating = ?, note = ? WHERE id = ?').run(rating, note?.slice(0, 1000) || null, id).changes) > 0;
  }
  toolCallStats(since = 0) {
    const one = (sql: string) => this.db.prepare(sql).get(since) as any;
    const all = (sql: string) => this.db.prepare(sql).all(since) as any[];
    const totals = one('SELECT COUNT(*) AS calls, COALESCE(SUM(ok = 0), 0) AS failed, COALESCE(SUM(rating = 1), 0) AS good, COALESCE(SUM(rating = -1), 0) AS bad FROM tool_calls WHERE ts >= ?');
    return {
      ...totals,
      byClient: all('SELECT client, COUNT(*) AS calls, SUM(ok = 0) AS failed, MAX(ts) AS lastTs FROM tool_calls WHERE ts >= ? GROUP BY client ORDER BY calls DESC'),
      byTool: all('SELECT tool, COUNT(*) AS calls, SUM(ok = 0) AS failed, ROUND(AVG(duration_ms)) AS avgMs, MAX(duration_ms) AS maxMs, SUM(rating = 1) AS good, SUM(rating = -1) AS bad FROM tool_calls WHERE ts >= ? GROUP BY tool ORDER BY calls DESC'),
      topErrors: all('SELECT tool, error, COUNT(*) AS count, MAX(ts) AS lastTs FROM tool_calls WHERE ts >= ? AND ok = 0 GROUP BY tool, error ORDER BY count DESC LIMIT 10'),
      byDay: all("SELECT date(ts / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS calls, SUM(ok = 0) AS failed FROM tool_calls WHERE ts >= ? GROUP BY day ORDER BY day")
    } as { calls: number; failed: number; good: number; bad: number; byClient: any[]; byTool: any[]; topErrors: any[]; byDay: any[] };
  }

  // --- reports ---
  saveReport(period: string, kind: 'weekly' | 'monthly' | 'agent', json: unknown, now = Date.now()): string {
    const id = `${kind}-${period}`;
    this.db.prepare('INSERT INTO reports (id, period, kind, created_at, json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at, json=excluded.json')
      .run(id, period, kind, now, JSON.stringify(json));
    return id;
  }
  reports(kind?: string): Array<{ id: string; period: string; kind: string; createdAt: number }> {
    return (this.db.prepare(`SELECT id, period, kind, created_at FROM reports ${kind ? 'WHERE kind = ?' : ''} ORDER BY created_at DESC`).all(...(kind ? [kind] : [])) as any[])
      .map(r => ({ id: r.id, period: r.period, kind: r.kind, createdAt: r.created_at }));
  }
  report(id: string): unknown {
    const row = this.db.prepare('SELECT json FROM reports WHERE id = ?').get(id) as any;
    return row ? JSON.parse(row.json) : null;
  }

  // --- derived (used by the console home and the operator summary) ---
  summary(now = Date.now()) {
    const milestones = this.milestones();
    const done = milestones.filter(m => m.status === 'done').length;
    const lastLogin = (this.db.prepare("SELECT MAX(ts) AS ts FROM activity WHERE actor='client' AND type='login'").get() as any).ts ?? null;
    const lastClientAction = (this.db.prepare("SELECT MAX(ts) AS ts FROM activity WHERE actor='client'").get() as any).ts ?? null;
    return {
      milestonePct: milestones.length ? Math.round((done / milestones.length) * 100) : 0,
      nextMilestone: milestones.find(m => m.status !== 'done') ?? null,
      lastLogin, lastClientAction,
      costMonthToDateUsd: Number(this.monthToDateUsd(now).toFixed(4))
    };
  }

  close() { this.db.close(); }
}

