import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VisualizationServer } from '../../src/server/server.js';

describe('single-client core authentication', () => {
  it('onboards one admin and protects client APIs with durable sessions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'marketing-core-'));
    let server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
    let port = await server.start();
    let base = `http://127.0.0.1:${port}`;
    try {
      expect(await (await fetch(base + '/api/core/onboarding/status')).json()).toEqual({ required: true });

      const onboard = await fetch(base + '/api/core/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'correct horse battery staple' })
      });
      expect(onboard.status).toBe(201);
      expect(onboard.headers.get('set-cookie')).toContain('marketing_session=');
      const onboarded = await onboard.json();
      expect(onboarded.user.username).toBe('admin');
      expect(onboarded.token).toBeTruthy();

      expect((await fetch(base + '/api/ads/dashboard')).status).toBe(401);
      expect((await fetch(base + '/api/core/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'other', password: 'another secure password' })
      })).status).toBe(409);

      const badLogin = await fetch(base + '/api/core/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong password here' })
      });
      expect(badLogin.status).toBe(401);
      expect(await badLogin.json()).toEqual({ error: 'Invalid username or password' });

      const login = await fetch(base + '/api/core/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'correct horse battery staple' })
      });
      expect(login.status).toBe(200);
      const session = await login.json();
      const authorization = { Authorization: `Bearer ${session.token}` };
      expect((await fetch(base + '/api/ads/dashboard', { headers: authorization })).status).toBe(200);
      expect((await (await fetch(base + '/api/core/auth/session', { headers: authorization })).json()).user.username).toBe('admin');

      await server.stop();
      server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
      port = await server.start();
      base = `http://127.0.0.1:${port}`;
      expect((await fetch(base + '/api/ads/dashboard', { headers: authorization })).status).toBe(200);

      expect((await fetch(base + '/api/core/auth/logout', { method: 'POST', headers: authorization })).status).toBe(204);
      expect((await fetch(base + '/api/ads/dashboard', { headers: authorization })).status).toBe(401);
    } finally {
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
