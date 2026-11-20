import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrackingStore } from '../../src/core/tracking/store.js';
import { buildAgentReport } from '../../src/core/tracking/agent-report.js';
import { defaultSystemHandlers } from '../../src/departments/scheduler.js';
import { VisualizationServer } from '../../src/server/server.js';

describe('agent activity log', () => {
  it('redacts secrets, rates outputs and turns failures into fixes', () => {
    const store = new TrackingStore(mkdtempSync(join(tmpdir(), 'agent-')));
    const now = Date.now();
    const id = store.logToolCall({ client: 'claude-code', tool: 'ads_findings', args: { accountId: 'act_1', accessToken: 'EAAsecret' }, ok: true, durationMs: 120, output: { findings: [] }, ts: now });
    for (let i = 0; i < 5; i++) store.logToolCall({ client: 'codex', tool: 'meta_ads_get_insights', ok: false, durationMs: 50, error: 'rate limited', ts: now });
    expect(store.toolCall(id)!.args).not.toContain('EAAsecret');
    expect(store.rateToolCall(id, -1, 'missed the paused ad set')).toBe(true);

    const stats = store.toolCallStats(now - 1000);
    expect(stats).toMatchObject({ calls: 6, failed: 5, bad: 1 });
    expect(store.toolCalls({ client: 'codex', failed: true })).toHaveLength(5);

    const report = buildAgentReport(store, now + 1);
    expect(report.flagged[0]).toMatchObject({ tool: 'ads_findings', note: 'missed the paused ad set' });
    expect(report.improvements.some(i => i.includes('meta_ads_get_insights failed 100%') && i.includes('rate limited'))).toBe(true);
    expect(report.improvements.some(i => i.includes('ads_findings: 1 output(s) marked wrong'))).toBe(true);
    store.close();
  });

  it('serves calls, ratings and saved reports to a signed-in dashboard only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-http-'));
    const server = new VisualizationServer(0, undefined, '127.0.0.1', dir);
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const onboard = await fetch(base + '/api/core/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'correct horse battery staple' }) });
      expect((await fetch(base + '/api/console/agent')).status).toBe(401);   // open only before the first user exists
      const headers = { 'Content-Type': 'application/json', cookie: onboard.headers.get('set-cookie')!.split(';')[0] };
      const id = server.tracking.logToolCall({ client: 'codex', tool: 'ads_findings', ok: true, durationMs: 10, output: 'x'.repeat(1000) });
      const list = await (await fetch(base + '/api/console/agent?days=1&client=codex', { headers })).json();
      expect(list.stats.calls).toBe(1);
      expect(list.calls[0].output.length).toBeLessThan(300);   // list is a preview; detail has it all
      expect((await (await fetch(`${base}/api/console/agent/calls/${id}`, { headers })).json()).call.output).toHaveLength(1000);
      expect((await fetch(`${base}/api/console/agent/calls/${id}/rating`, { method: 'POST', headers, body: JSON.stringify({ rating: 5 }) })).status).toBe(400);
      expect((await fetch(`${base}/api/console/agent/calls/${id}/rating`, { method: 'POST', headers, body: JSON.stringify({ rating: 1, note: 'spot on' }) })).status).toBe(200);
      const saved = await (await fetch(base + '/api/console/agent/report', { method: 'POST', headers })).json();
      expect(saved.report.stats.good).toBe(1);
      const results = await (await fetch(base + '/api/console/results', { headers })).json();
      expect(results.reports.some((r: any) => r.kind === 'agent')).toBe(false);   // client Results stays ads-only
    } finally { await server.stop(); }
  });

  it('records harness jobs and saves the agent report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-job-'));
    const result = await defaultSystemHandlers(root)['agent-report']({});
    expect(result.status).toBe('COMPLETED');
    const store = new TrackingStore(join(root, 'tracking'));
    expect(store.toolCalls()[0]).toMatchObject({ client: 'harness', tool: 'job:agent-report', ok: true });
    expect(store.reports('agent')).toHaveLength(1);
    store.close();
  });
});
