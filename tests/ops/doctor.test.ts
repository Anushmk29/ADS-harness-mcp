import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDoctor } from '../../src/ops/doctor.js';

function configDir(ads: string) {
  const dir = mkdtempSync(join(tmpdir(), 'doctor-'));
  cpSync(join(process.cwd(), 'config', 'business.yaml'), join(dir, 'business.yaml'));
  writeFileSync(join(dir, 'ads-module.yaml'), ads);
  writeFileSync(join(dir, 'content-sources.yaml'), 'publish:\n  mode: off\n');
  return dir;
}

describe('doctor', () => {
  it('fails when accounts are configured without credentials or no LLM key exists', async () => {
    const saved = { ...process.env };
    for (const k of ['ADS_DIRECT_META_ACCESS_TOKEN', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[k];
    try {
      const checks = await runDoctor({ configDir: configDir("accounts:\n  meta: ['1']\n") });
      expect(checks.find(c => c.name === 'meta')?.level).toBe('fail');
      expect(checks.find(c => c.name === 'llm')?.level).toBe('fail');
      expect(checks.find(c => c.name === 'business.yaml')?.level).toBe('ok');
    } finally { process.env = saved; }
  });

  it('flags a Meta token expiring within 7 days', async () => {
    const saved = { ...process.env };
    process.env.ADS_DIRECT_META_ACCESS_TOKEN = 't';
    process.env.DEEPSEEK_API_KEY = 'k'; process.env.DEEPSEEK_MODEL = 'm';
    const now = Date.UTC(2026, 9, 11);
    const fake = (async (url: string) => new Response(JSON.stringify(String(url).includes('debug_token')
      ? { data: { is_valid: true, expires_at: now / 1000 + 3 * 86400 } } : {}), { status: 200 })) as typeof fetch;
    try {
      const checks = await runDoctor({ live: true, fetch: fake, now, configDir: configDir("accounts:\n  meta: ['1']\n") });
      expect(checks.find(c => c.name === 'meta')).toMatchObject({ level: 'fail', detail: expect.stringContaining('expires in 3 day') });
      expect(checks.find(c => c.name === 'llm:deepseek')?.level).toBe('ok');
    } finally { process.env = saved; }
  });
});
