import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigLoader } from '../../src/config/config-loader.js';

afterEach(() => { vi.unstubAllEnvs(); ConfigLoader.resetCache(); });

describe('business config in production', () => {
  it('fails loudly on an invalid or missing business.yaml instead of using defaults', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    writeFileSync(join(dir, 'bad.yaml'), 'business:\n  name: 42\n');
    expect(() => ConfigLoader.loadConfig(join(dir, 'bad.yaml'))).toThrow(/Invalid/);
    expect(() => ConfigLoader.loadConfig(join(dir, 'missing.yaml'))).toThrow(/Missing/);
  });

  it('still falls back to defaults outside production (tests, local dev)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(ConfigLoader.loadConfig(join(tmpdir(), 'does-not-exist.yaml')).business.name).toBeTruthy();
  });
});
