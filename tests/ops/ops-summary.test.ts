import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrackingStore } from '../../src/core/tracking/store.js';
import { approvalResponseHours, opsSummary, summaryLine, digestText } from '../../src/ops/summary.js';
import { VisualizationServer } from '../../src/server/server.js';
import { CoreStore } from '../../src/core/client/core-store.js';
import { resetAlertDedup } from '../../src/observability/alerts.js';

const H = 3_600_000;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetAlertDedup(); });

describe('ops summary', () => {
  it('computes client response time, approvals over 48h, dead jobs and doctor reds', () => {
    const t = new TrackingStore(mkdtempSync(join(tmpdir(), 'ops-')));
    const now = 100 * H;
    t.log('system', 'ads.pending', 'a', 'r1', now - 10 * H); t.log('client', 'ads.rejected', 'a', 'r1', now - 6 * H);              // 4h
    t.log('system', 'ads.pending', 'b', 'op1', now - 9 * H); t.log('client', 'ads.approved', 'b', 'op1', now - 1 * H);              // 8h
    expect(approvalResponseHours(t, now)).toBe(6);
    const s = opsSummary({ tracking: t, now, client: 'acme',
      jobs: [{ id: 'kpi', state: 'DEAD', lastError: 'meta 500' }, { id: 'doctor-daily', state: 'READY', result: { fails: ['meta: token expires in 3 day(s)'] } }],
      pending: [{ kind: 'ads', id: 'op2', title: 'Pause ad 9?', createdAt: now - 50 * H }, { kind: 'ads', id: 'op3', title: 'Change budget', createdAt: now - H }] });
    expect(s.approvals).toMatchObject({ waiting: 2, oldestHours: 50, over48h: [{ id: 'op2' }] });
    expect(summaryLine(s)).toMatch(/^ATTN 1 dead job\(s\), 1 doctor red, 1 approval\(s\) >48h/);
    expect(digestText(s)).toContain('DEAD jobs: kpi');
    t.close();
  });

  it('serves /api/ops/summary to the operator key only, never to a client session', async () => {
    vi.stubEnv('HARNESS_KEY', 'op-key');
    const dir = mkdtempSync(join(tmpdir(), 'ops-api-'));
    const store = new CoreStore(join(dir, 'core')); const { password } = store.createUserWithTemporaryPassword('client'); store.close();
    const server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const login = await fetch(base + '/api/core/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'client', password }) });
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      expect((await fetch(base + '/api/ops/summary', { headers: { cookie } })).status).toBe(403);
      const res = await fetch(base + '/api/ops/summary', { headers: { 'x-harness-key': 'op-key' } });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ approvals: { waiting: expect.any(Number) }, milestones: { pct: 0 } });
      const line = await (await fetch(base + '/api/ops/summary?format=line', { headers: { 'x-harness-key': 'op-key' } })).text();
      expect(line).toContain('plan 0%');

      vi.stubEnv('ALERT_TELEGRAM_BOT_TOKEN', 'bot-token'); vi.stubEnv('ALERT_TELEGRAM_CHAT_ID', '42');
      const sent: any[] = [];
      const real = globalThis.fetch;
      vi.stubGlobal('fetch', async (url: any, init?: any) => { if (String(url).startsWith('https://api.telegram.org/')) { sent.push(JSON.parse(init.body)); return new Response('ok'); } return real(url, init); });
      await server.opsHandlers()['ops-digest']({});
      expect(sent[0]).toMatchObject({ chat_id: '42', text: expect.stringContaining('Weekly ops') });
      expect(sent[0].text).toMatch(/ops-digest:/);
    } finally { await server.stop(); }
  });
});
