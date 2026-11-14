import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defaultProviderManifests, type ProviderVersionManifest } from './contracts.js';

export class AdsState {
  private db: DatabaseSync;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'control.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS provider_versions (provider TEXT PRIMARY KEY, manifest TEXT NOT NULL); CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(kind,id))');
    const select = this.db.prepare('SELECT manifest FROM provider_versions WHERE provider = ?');
    const upsert = this.db.prepare('INSERT INTO provider_versions(provider, manifest) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET manifest=excluded.manifest');
    for (const manifest of defaultProviderManifests()) {
      const row = select.get(manifest.provider) as { manifest: string } | undefined;
      const previous = row && JSON.parse(row.manifest) as ProviderVersionManifest;
      if (previous?.apiVersion === manifest.apiVersion && previous.minorVersion === manifest.minorVersion) {
        manifest.verifiedAt = previous.verifiedAt;
        manifest.capabilities = manifest.capabilities.map(capability => {
          const old = previous.capabilities.find(candidate => candidate.id === capability.id);
          return capability.status === 'UNVERIFIED' && old ? { ...capability, status: old.status, verifiedAt: old.verifiedAt } : capability;
        });
      }
      upsert.run(manifest.provider, JSON.stringify(manifest));
    }
  }

  providerVersions(): ProviderVersionManifest[] {
    return (this.db.prepare('SELECT manifest FROM provider_versions ORDER BY CASE provider WHEN \'meta\' THEN 1 WHEN \'google\' THEN 2 ELSE 3 END').all() as Array<{ manifest: string }>)
      .map(row => JSON.parse(row.manifest));
  }

  providerCapabilities(provider: ProviderVersionManifest['provider']) {
    return this.providerVersions().find(manifest => manifest.provider === provider)?.capabilities ?? [];
  }

  save(kind: string, id: string, record: unknown): void {
    this.db.prepare('INSERT INTO records(kind,id,updated_at,record) VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET updated_at=excluded.updated_at, record=excluded.record')
      .run(kind, id, new Date().toISOString(), JSON.stringify(record));
  }

  get(kind: string, id: string): any | undefined {
    const row = this.db.prepare('SELECT record FROM records WHERE kind = ? AND id = ?').get(kind, id) as { record: string } | undefined;
    return row ? JSON.parse(row.record) : undefined;
  }

  list(kind: string): unknown[] {
    return (this.db.prepare('SELECT record FROM records WHERE kind = ? ORDER BY updated_at DESC').all(kind) as Array<{ record: string }>).map(row => JSON.parse(row.record));
  }

  close(): void { this.db.close(); }
}

