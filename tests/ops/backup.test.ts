import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupDataDir } from '../../src/ops/backup.js';

describe('backupDataDir', () => {
  it('snapshots sqlite (incl. WAL contents) and json, skipping backups/', () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-'));
    mkdirSync(join(root, 'ads'));
    const db = new DatabaseSync(join(root, 'ads', 'operations.sqlite'));
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('kept')");
    writeFileSync(join(root, 'approvals.json'), '{}');
    mkdirSync(join(root, 'backups', 'old'), { recursive: true });
    writeFileSync(join(root, 'backups', 'old', 'x.json'), '{}');
    const dest = join(root, 'backups', 'now');
    const files = backupDataDir(dest, root);
    db.close();
    expect(files.sort()).toEqual(['approvals.json', join('ads', 'operations.sqlite')].sort());
    const copy = new DatabaseSync(join(dest, 'ads', 'operations.sqlite'));
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'kept' });
    copy.close();
    expect(existsSync(join(dest, 'backups'))).toBe(false);
  });
});
