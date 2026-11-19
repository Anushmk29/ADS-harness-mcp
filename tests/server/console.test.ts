import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VisualizationServer } from '../../src/server/server.js';
import { AdsService } from '../../src/modules/ads/service.js';
import { CoreStore } from '../../src/core/client/core-store.js';

const realFetch = globalThis.fetch;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function withServer(dir: string, fn: (base: string, login: () => Promise<string>, server: VisualizationServer) => Promise<void>) {
  const server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
  const base = `http://127.0.0.1:${await server.start()}`;
  const login = async () => {
    const { password } = (() => { const s = new CoreStore(join(dir, 'core')); try { return s.createUserWithTemporaryPassword('client'); } finally { s.close(); } })();
    const res = await realFetch(base + '/api/core/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'client', password }) });
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    return cookie;
  };
  try { await fn(base, login, server); } finally { await server.stop(); }
}

describe('client console', () => {
  it('forces a password change for an operator-created login and disables public sign-up in production', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'console-auth-'));
    await withServer(dir, async (base, login) => {
      vi.stubEnv('NODE_ENV', 'production');
      expect((await realFetch(base + '/api/core/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":"x","password":"long enough password"}' })).status).toBe(403);
      vi.unstubAllEnvs();
      const cookie = await login();
      const session = await (await realFetch(base + '/api/core/auth/session', { headers: { cookie } })).json();
      expect(session).toMatchObject({ user: { username: 'client' }, mustChangePassword: true });
    });
  });

  it('shows ad changes in the inbox; "yes" approves and dispatches in one call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'console-inbox-'));
    const policy = join(dir, 'ads-module.yaml');
    writeFileSync(policy, "mode: live-with-approval\naccounts:\n  meta: ['123']\n");
    vi.stubEnv('ADS_POLICY_FILE', policy);
    vi.stubEnv('ADS_DIRECT_META_ACCESS_TOKEN', 'test');
    const graph = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'POST' ? { success: true } : { id: '9', status: 'PAUSED', account_id: '123' })));
    vi.stubGlobal('fetch', (url: any, init?: any) => String(url).includes('graph.facebook.com') ? graph(String(url), init) : realFetch(url, init));

    const seed = new AdsService({ storageDir: dir });
    await seed.call('meta_ads_update_ad', { accountId: '123', objectId: '9', operationId: 'fatigue-9-2026-10-11', data: { status: 'PAUSED' } });
    seed.close();

    await withServer(dir, async (base, login, server) => {
      const cookie = await login();
      const get = async (path: string) => (await realFetch(base + path, { headers: { cookie } })).json();
      const { items } = await get('/api/console/approvals');
      const ad = items.find((i: any) => i.kind === 'ads');
      expect(ad).toMatchObject({ id: 'fatigue-9-2026-10-11', title: 'Pause ad 9?' });
      expect(ad.description).toContain('dropped more than 20%');
      expect(items.every((i: any) => i.kind === 'ads')).toBe(true);

      const yes = await (await realFetch(base + `/api/console/approvals/ads/${ad.id}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'yes', feedback: 'agreed, it was tired' }) })).json();
      expect(yes.status).not.toBe('PENDING_APPROVAL');
      expect(graph.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
      const removed = await realFetch(base + '/api/console/approvals/content/x', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'no' }) });
      expect(removed.status).toBe(404);

      const after = await get('/api/console/approvals');
      expect(after.items.find((i: any) => i.id === ad.id)).toBeUndefined();
      const home = await get('/api/console/home');
      expect(home.summary).toHaveProperty('milestonePct');
      const types = server.tracking.activity({ limit: 50 }).map(a => a.type);
      expect(types).toEqual(expect.arrayContaining(['login', 'ads.approved', 'feedback']));
    });
  });
  it('serves the client report as a branded, locked-down HTML page to a signed-in client only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'console-report-'));
    vi.stubEnv('REPORT_BRAND_NAME', 'Acme Shoes'); vi.stubEnv('HARNESS_KEY', 'operator-key'); // not open local-dev mode
    await withServer(dir, async (base, login, server) => {
      server.tracking.saveReport('2026-11-09', 'weekly', { kind: 'weekly', since: '2026-11-09', until: '2026-11-15', goal: 'lead', headline: 'Ad spend 1,400', totals: { current: { spend: 1400 }, previous: {} },
        findings: [{ severity: 'critical', entity: { name: 'Broad' }, message: 'Spent 700 with no leads.' }], actions: [], work: {}, narrative: { summary: 'A week.', points: [], source: 'template' } });
      expect((await realFetch(base + '/api/console/reports/weekly-2026-11-09/html')).status).toBe(401);
      const cookie = await login();
      const res = await realFetch(base + '/api/console/reports/weekly-2026-11-09/html', { headers: { cookie } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
      const html = await res.text();
      expect(html).toContain('Weekly ads report · Acme Shoes');
      expect(html).toContain('Spent 700 with no leads.');
      expect((await realFetch(base + '/api/console/reports/weekly-missing/html', { headers: { cookie } })).status).toBe(404);
    });
  });
});
