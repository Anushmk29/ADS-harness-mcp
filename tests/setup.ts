import { afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test file runs in a throwaway working directory so the default .marketing-data
// store (memory, approvals, audit, sessions) never touches the real one.
const repo = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), 'harness-test-'));
cpSync(join(repo, 'config'), join(sandbox, 'config'), { recursive: true });
cpSync(join(repo, 'public'), join(sandbox, 'public'), { recursive: true });
process.chdir(sandbox);
delete process.env.DATA_DIR; // never let a shell DATA_DIR point tests at real client data

afterAll(() => {
  process.chdir(repo);
  try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* sqlite handles may still be open on Windows */ }
});
