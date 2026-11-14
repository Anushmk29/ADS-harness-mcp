import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { VisualizationServer } from '../../src/server/server.js';

afterEach(() => { vi.unstubAllEnvs(); });

it('keeps first-admin onboarding local unless the operator authenticates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'onboarding-'));
  const server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  const body = JSON.stringify({ username: 'owner', password: 'a long private password' });
  try {
    const externalStatus = await new Promise<number>((resolve, reject) => {
      const req = request(base + '/api/core/onboarding', { method: 'POST', headers: { Host: 'public.example' } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on('error', reject); req.end(body);
    });
    expect(externalStatus).toBe(403);
    expect(await (await fetch(base + '/api/core/onboarding/status')).json()).toEqual({ required: true });
    vi.stubEnv('HARNESS_KEY', 'operator');
    expect((await fetch(base + '/api/core/onboarding', { method: 'POST', body })).status).toBe(403);
    expect((await fetch(base + '/api/core/onboarding', { method: 'POST', headers: { 'x-harness-key': 'operator' }, body })).status).toBe(201);
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

it('rejects prototype keys before settings can pollute shared objects', async () => {
  vi.stubEnv('HARNESS_KEY', 'operator');
  const dir = mkdtempSync(join(tmpdir(), 'settings-'));
  const server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
  const base = `http://127.0.0.1:${await server.start()}`;
  const config = readFileSync('config/business.yaml', 'utf8');
  try {
    for (const body of ['{"__proto__":{"auditPolluted":true}}', '{"brand":{"__proto__":{"auditPolluted":true}}}', '{"constructor":{"prototype":{"auditPolluted":true}}}']) {
      const response = await fetch(base + '/api/business/config', { method: 'PATCH', headers: { 'x-harness-key': 'operator', 'Content-Type': 'application/json' }, body });
      expect(response.status).toBe(400);
      expect(Object.prototype).not.toHaveProperty('auditPolluted');
      expect(readFileSync('config/business.yaml', 'utf8')).toBe(config);
    }
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

it('does not let spoofed forwarding headers reset the login attempt limit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'login-throttle-'));
  const server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
  const base = `http://127.0.0.1:${await server.start()}`;
  try {
    for (let i = 0; i < 12; i++) {
      const response = await fetch(base + '/api/core/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `192.0.2.${i}` }, body: '{"username":"owner","password":"wrong password"}' });
      expect(response.status).toBe(i < 10 ? 401 : 429);
    }
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});
