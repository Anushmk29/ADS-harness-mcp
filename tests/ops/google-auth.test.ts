import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authUrl, codeFromRedirect, loadGoogleClient, signIn, SCOPES, gscTotals } from '../../src/ops/google.js';

const client = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'sec' };

describe('google-auth', () => {
  it('reads the downloaded desktop client JSON', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'gc-')), 'client.json');
    writeFileSync(file, JSON.stringify({ installed: { client_id: 'abc', client_secret: 'xyz', redirect_uris: ['http://localhost'] } }));
    expect(loadGoogleClient(file)).toEqual({ clientId: 'abc', clientSecret: 'xyz' });
  });

  it('asks for offline access with fresh consent, PKCE, and both read-only scopes', () => {
    const u = new URL(authUrl(client, 'http://localhost:5000', [SCOPES.analytics, SCOPES.searchConsole], { challenge: 'ch', state: 'st' }));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ access_type: 'offline', prompt: 'consent', code_challenge_method: 'S256', redirect_uri: 'http://localhost:5000',
      scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly' });
  });

  it('rejects a pasted redirect from a different attempt', () => {
    expect(() => codeFromRedirect('http://localhost:1/?code=c&state=other', 'mine')).toThrow(/different attempt/);
    expect(codeFromRedirect('http://localhost:1/?code=c1&state=mine', 'mine')).toBe('c1');
  });

  it('completes the loopback sign-in and returns the refresh token', async () => {
    let printed = '';
    const google = vi.fn(async (_url: any, init: any) => {
      const body = new URLSearchParams(init.body);
      expect(body.get('code')).toBe('the-code');
      expect(body.get('code_verifier')).toBeTruthy();
      return new Response(JSON.stringify({ refresh_token: 'rt-123', access_token: 'at', scope: 'x' }));
    });
    const pending = signIn(client, [SCOPES.analytics], { log: s => { printed += s; }, paste: () => new Promise(() => {}) }, google as any);
    await vi.waitFor(() => expect(printed).toContain('accounts.google.com'));
    const url = new URL(printed.match(/https:\/\/accounts\.google\.com\S+/)![0]);
    const redirect = `${url.searchParams.get('redirect_uri')}/?code=the-code&state=${url.searchParams.get('state')}`;
    expect((await fetch(redirect)).status).toBe(200);           // what the browser does after "Allow"
    await expect(pending).resolves.toMatchObject({ refreshToken: 'rt-123' });
  });

  it('queries Search Console totals for a window ending 3 days ago', async () => {
    const f = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain(encodeURIComponent('sc-domain:example.com'));
      expect(JSON.parse(init.body)).toMatchObject({ startDate: '2026-09-12', endDate: '2026-10-09' });
      return new Response(JSON.stringify({ rows: [{ clicks: 120, impressions: 4000, ctr: 0.03, position: 11.2 }] }));
    });
    const r = await gscTotals('tok', 'sc-domain:example.com', 28, f as any, Date.UTC(2026, 9, 12));
    expect(r).toMatchObject({ clicks: 120, impressions: 4000 });
  });
});
