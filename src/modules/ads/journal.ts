import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Platform } from './tools.js';
import { alert } from '../../observability/alerts.js';
import { VisualizationEventBus } from '../../visualization/event-bus.js';

export type OperationStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'AUTHORIZED' | 'DISPATCHED' | 'VERIFIED' | 'REJECTED' | 'FAILED' | 'PARTIAL' | 'UNCERTAIN';

export interface OperationBinding {
  provider: Platform;
  accountId: string;
  operationId: string;
  object: string;
  payloadHash: string;
}

export interface Operation {
  id: string;
  tool: string;
  args: any;
  hash: string;
  binding: OperationBinding;
  status: OperationStatus;
  transitions: Array<{ status: OperationStatus; at: string }>;
  approval?: OperationBinding & { approved: boolean; decidedAt: string };
  dispatch?: { owner: string; leaseExpiresAt: string };
  result?: any;
  error?: string;
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',')}}`;
  return JSON.stringify(value);
}

export function payloadHash(tool: string, args: any): string {
  return createHash('sha256').update(canonical({ tool, args })).digest('hex');
}

export function transition(record: Operation, status: OperationStatus): Operation {
  record.status = status;
  record.transitions.push({ status, at: new Date().toISOString() });
  try { VisualizationEventBus.getInstance().emitEvent({ type: 'ADS_OPERATION_CHANGED', operationId: record.id, tool: record.tool, status, timestamp: Date.now() }); } catch { /* observers cannot change execution */ }
  // A write whose outcome is unknown needs a human to reconcile it in the ad platform; never retried automatically.
  if (status === 'UNCERTAIN' || status === 'PARTIAL') void alert('critical', `ads-${status.toLowerCase()}:${record.id}`,
    `ads operation ${record.id} (${record.tool}) is ${status}; check the ad account before doing anything else`);
  return record;
}

function migrateLegacy(record: any): Operation {
  const status = ({ PENDING: 'PENDING_APPROVAL', COMPLETED: 'VERIFIED', ACCEPTED: 'DISPATCHED' } as Record<string, OperationStatus>)[record.status] ?? record.status;
  record.status = status;
  record.transitions ??= [{ status, at: new Date(0).toISOString() }];
  return record;
}

export class OperationJournal {
  private db: DatabaseSync;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'operations.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, hash TEXT NOT NULL, record TEXT NOT NULL)');
  }

  get(id: string): Operation | undefined {
    const row = this.db.prepare('SELECT record FROM operations WHERE id = ?').get(id) as { record: string } | undefined;
    return row ? migrateLegacy(JSON.parse(row.record)) : undefined;
  }

  list(statuses?: OperationStatus[]): Operation[] {
    return (this.db.prepare('SELECT record FROM operations ORDER BY rowid DESC').all() as Array<{ record: string }>).map(row => migrateLegacy(JSON.parse(row.record))).filter(record => !statuses?.length || statuses.includes(record.status));
  }

  create(record: Operation): Operation {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.get(record.id);
      if (existing && existing.hash !== record.hash) throw new Error('Operation ID already used for a different payload');
      if (!existing && record.tool === 'ads_continue_meta_launch') {
        const child = this.db.prepare(`SELECT id FROM operations WHERE json_extract(record, '$.tool') = 'ads_continue_meta_launch'
          AND json_extract(record, '$.args.launchId') = ? AND json_extract(record, '$.status') NOT IN ('FAILED','REJECTED') LIMIT 1`)
          .get(record.args.launchId) as { id: string } | undefined;
        if (child) throw new Error(`Launch already has continuation ${child.id}; inspect it and continue that operation if it is PARTIAL`);
      }
      if (!existing) this.db.prepare('INSERT INTO operations(id, hash, record) VALUES (?, ?, ?)').run(record.id, record.hash, JSON.stringify(record));
      this.db.exec('COMMIT');
      return existing ?? record;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  submit(id: string): Operation {
    const record = this.get(id);
    if (!record) throw new Error('Operation not found');
    if (record.status !== 'DRAFT') return record;
    transition(record, 'PENDING_APPROVAL');
    const updated = this.db.prepare("UPDATE operations SET record = ? WHERE id = ? AND hash = ? AND json_extract(record, '$.status') = 'DRAFT'").run(JSON.stringify(record), id, record.hash);
    return updated.changes ? record : this.get(id)!;
  }

  decide(id: string, approved: boolean): Operation {
    const record = this.get(id);
    if (!record || record.status !== 'PENDING_APPROVAL') throw new Error('Operation not found or no longer pending');
    record.approval = { ...record.binding, approved, decidedAt: new Date().toISOString() };
    transition(record, approved ? 'AUTHORIZED' : 'REJECTED');
    const updated = this.db.prepare("UPDATE operations SET record = ? WHERE id = ? AND hash = ? AND json_extract(record, '$.status') = 'PENDING_APPROVAL'").run(JSON.stringify(record), id, record.hash);
    if (!updated.changes) throw new Error('Operation not found or no longer pending');
    return record;
  }

  claim(id: string, owner: string, leaseMs = 60_000): Operation | undefined {
    const record = this.get(id);
    if (!record || record.status !== 'AUTHORIZED') return undefined;
    record.dispatch = { owner, leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString() };
    transition(record, 'DISPATCHED');
    const updated = this.db.prepare("UPDATE operations SET record = ? WHERE id = ? AND hash = ? AND json_extract(record, '$.status') = 'AUTHORIZED'").run(JSON.stringify(record), id, record.hash);
    return updated.changes ? record : undefined;
  }

  failAuthorized(id: string, error: string): Operation {
    const record = this.get(id);
    if (!record) throw new Error('Operation not found');
    if (record.status !== 'AUTHORIZED') return record;
    record.error = error;
    transition(record, 'FAILED');
    const updated = this.db.prepare("UPDATE operations SET record = ? WHERE id = ? AND hash = ? AND json_extract(record, '$.status') = 'AUTHORIZED'").run(JSON.stringify(record), id, record.hash);
    return updated.changes ? record : this.get(id)!;
  }

  markExpiredDispatchUncertain(id: string, now = Date.now()): Operation {
    const record = this.get(id);
    if (!record) throw new Error('Operation not found');
    if (record.status !== 'DISPATCHED' || record.result || (record.dispatch && Date.parse(record.dispatch.leaseExpiresAt) > now)) return record;
    transition(record, 'UNCERTAIN');
    const updated = this.db.prepare("UPDATE operations SET record = ? WHERE id = ? AND hash = ? AND json_extract(record, '$.status') = 'DISPATCHED'").run(JSON.stringify(record), id, record.hash);
    return updated.changes ? record : this.get(id)!;
  }

  finish(record: Operation, owner: string): boolean {
    return Number(this.db.prepare("UPDATE operations SET record = ? WHERE id = ? AND hash = ? AND json_extract(record, '$.status') = 'DISPATCHED' AND json_extract(record, '$.dispatch.owner') = ?").run(JSON.stringify(record), record.id, record.hash, owner).changes) === 1;
  }

  resolveDispatched(id: string, result: any, status: 'VERIFIED' | 'FAILED'): Operation {
    const record = this.get(id);
    if (!record) throw new Error('Operation not found');
    if (record.status !== 'DISPATCHED') return record;
    record.result = result;
    if (status === 'FAILED') record.error = result?.error?.message ?? 'Provider operation failed';
    transition(record, status);
    const updated = this.db.prepare("UPDATE operations SET record = ? WHERE id = ? AND hash = ? AND json_extract(record, '$.status') = 'DISPATCHED'").run(JSON.stringify(record), id, record.hash);
    return updated.changes ? record : this.get(id)!;
  }

  close(): void { this.db.close(); }
}
