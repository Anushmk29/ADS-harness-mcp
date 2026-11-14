import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDir } from '../config/paths.js';

/** Consistent snapshot of DATA_DIR: VACUUM INTO for each sqlite (safe while the app writes), plain copy for the rest. */
export function backupDataDir(dest: string, root = dataDir()): string[] {
  const written: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const src = path.join(dir, entry.name), rel = path.relative(root, src);
      if (rel === 'backups' || rel === 'logs' || /\.(tmp|sqlite-wal|sqlite-shm)$/.test(entry.name)) continue;
      if (path.resolve(src) === path.resolve(dest)) continue;
      const out = path.join(dest, rel);
      if (entry.isDirectory()) { walk(src); continue; }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      if (entry.name.endsWith('.sqlite')) {
        const db = new DatabaseSync(src, { readOnly: true });
        try { db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`); } finally { db.close(); }
      } else fs.copyFileSync(src, out);
      written.push(rel);
    }
  };
  fs.mkdirSync(dest, { recursive: true });
  walk(root);
  return written;
}
