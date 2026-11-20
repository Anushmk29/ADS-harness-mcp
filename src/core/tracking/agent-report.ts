// What the agents (Claude, Codex, other MCP clients) and scheduled harness jobs did, and where they struggled.
import type { TrackingStore } from './store.js';

const DAY = 86_400_000;

export function buildAgentReport(tracking: TrackingStore, now = Date.now(), days = 7) {
  const since = now - days * DAY;
  const stats = tracking.toolCallStats(since);
  const failures = tracking.toolCalls({ since, failed: true, limit: 20 }).map(c => ({ id: c.id, ts: c.ts, client: c.client, tool: c.tool, error: c.error }));
  const flagged = tracking.toolCalls({ since, rated: -1, limit: 50 }).map(c => ({ id: c.id, ts: c.ts, client: c.client, tool: c.tool, note: c.note }));
  // Rule-based pointers to what to fix next; thresholds are deliberately simple.
  const improvements: string[] = [];
  for (const t of stats.byTool) {
    const rate = t.failed / t.calls;
    if (t.calls >= 5 && rate >= 0.2) {
      const top = stats.topErrors.find(e => e.tool === t.tool);
      improvements.push(`${t.tool} failed ${Math.round(rate * 100)}% of ${t.calls} calls${top ? `; most common error: ${String(top.error).slice(0, 160)}` : ''}.`);
    }
    if (t.avgMs >= 20_000) improvements.push(`${t.tool} averages ${Math.round(t.avgMs / 1000)}s per call; check the provider or cache its reads.`);
    if (t.bad > 0) improvements.push(`${t.tool}: ${t.bad} output(s) marked wrong; read the notes and add a rule or test.`);
  }
  const outOfScope = stats.topErrors.filter(e => /outside this server scope|discovered skill capability/i.test(String(e.error)));
  if (outOfScope.length) improvements.push(`Agents asked for tools this server does not offer ${outOfScope.reduce((n, e) => n + e.count, 0)} time(s); check tool names and descriptions.`);
  const period = new Date(now).toLocaleDateString('en-CA');
  return {
    kind: 'agent' as const, period, since: new Date(since).toLocaleDateString('en-CA'), until: period, generatedAt: now,
    headline: stats.calls
      ? `${stats.calls} call(s) from ${stats.byClient.length} source(s), ${stats.failed} failed, ${stats.good} rated useful, ${stats.bad} rated wrong.`
      : 'No agent or harness activity recorded in this period.',
    stats, failures, flagged, improvements
  };
}

export function saveAgentReport(tracking: TrackingStore, now = Date.now()) {
  const report = buildAgentReport(tracking, now);
  return { id: tracking.saveReport(report.period, 'agent', report, now), report };
}
