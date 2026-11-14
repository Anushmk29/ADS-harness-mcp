import { it, expect } from 'vitest';
import { VisualizationServer } from '../../src/server/server.js';

it('preserves the office API while exposing modular discovery and rejecting cross-origin writes', async () => {
  const server = new VisualizationServer(0, undefined, '127.0.0.1');
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const offices = await (await fetch(base + '/api/departments')).json();
    expect(offices.departments).toHaveLength(4);
    const catalogue = await (await fetch(base + '/api/departments/catalog')).json();
    expect(catalogue).toHaveLength(4);
    const tools = await (await fetch(base + '/api/departments/analytics/tools')).json();
    expect(tools.every((t: any) => t.name.startsWith('ga4_'))).toBe(true);
    const ads = await (await fetch(base + '/api/ads/dashboard')).json();
    expect(ads.health.module).toBe('ads');
    expect(ads.capabilities.some((c: any) => c.name.startsWith('ga4_'))).toBe(true);
    expect((await fetch(base + '/api/content/dashboard')).status).toBe(404);
    const core = await (await fetch(base + '/api/core/reports/summary')).json();
    expect(core.sections.map((section: any) => section.module)).toEqual(['ads']);
    const versions = await (await fetch(base + '/api/provider-versions')).json();
    expect(versions.map((manifest: any) => manifest.provider)).toEqual(['meta', 'google', 'ga4']);
    const metaCapabilities = await (await fetch(base + '/api/meta/capabilities')).json();
    expect(metaCapabilities.every((capability: any) => capability.status)).toBe(true);
    const metaValidation = await (await fetch(base + '/api/meta/campaigns/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftId: 'api-draft', spec: {} }) })).json();
    expect(metaValidation.valid).toBe(false);
    expect(metaValidation.status).toBe('DRAFT');
    const ga4Audit = await (await fetch(base + '/api/ga4/audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: '123', evidence: { staleHours: 48 } }) })).json();
    expect(ga4Audit).toMatchObject({ health: 'BROKEN', recommendationStatus: 'INSUFFICIENT_EVIDENCE' });
    const denied = await fetch(base + '/api/departments/ads/run', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' });
    expect(denied.status).toBe(403);
  } finally { await server.stop(); }
});

it('operator key in a header; ?key only for the SSE stream; app shell public; cross-origin refused', async () => {
  process.env.HARNESS_KEY = 'test-harness-key';
  const server = new VisualizationServer(0, undefined, '127.0.0.1');
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    expect((await fetch(base + '/api/status', { headers: { Origin: 'https://team.example' } })).status).toBe(403);
    expect((await fetch(base + '/api/status')).status).toBe(401);                       // local callers need a key or a session
    expect((await fetch(base + '/api/status?key=test-harness-key')).status).toBe(401);  // a URL key never opens normal APIs
    expect((await fetch(base + '/api/status', { headers: { 'x-harness-key': 'test-harness-key' } })).status).toBe(200);
    const controller = new AbortController();
    const sse = await fetch(base + '/api/events/stream?key=test-harness-key', { signal: controller.signal });
    expect(sse.status).toBe(200); controller.abort();
    expect((await fetch(base + '/')).status).toBe(200);                                  // login screen loads without a key
  } finally { delete process.env.HARNESS_KEY; await server.stop(); }
});

it('mirrors real department runs onto the office agents', async () => {
  const server = new VisualizationServer(0, undefined, '127.0.0.1');
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const run = await fetch(base + '/api/departments/research/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: 'research_serp_intent_cluster' }) });
    expect(run.status).toBe(400); // no live research connector
    const agent = await (await fetch(base + '/api/agents/competitor_intelligence_agent')).json();
    expect(agent).toMatchObject({ status: 'FAILED', currentTaskName: 'research_serp_intent_cluster' });
  } finally { await server.stop(); }
});
