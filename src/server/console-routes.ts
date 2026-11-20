// Client console API: one place for the screens the client sees (Home, Approvals, Progress, Results).
import type http from 'node:http';
import type { TrackingStore } from '../core/tracking/store.js';
import type { MarketingModule } from '../core/modules/contracts.js';
import { localDate } from '../core/tracking/kpi-snapshot.js';
import { saveAgentReport } from '../core/tracking/agent-report.js';

export interface ConsoleContext {
  tracking: TrackingStore;
  ads: MarketingModule;
  parseBody: (req: http.IncomingMessage) => Promise<any>;
}

export interface InboxItem {
  kind: 'ads'; id: string; title: string; description: string; createdAt: number;
  details?: Record<string, unknown>;
}

const adsRun = async (ads: MarketingModule, capability: string, input: Record<string, unknown> = {}) => {
  const output: any = (await ads.run({ capability, input })).data;
  return output?.status === 'COMPLETED' && 'data' in output ? output.data : output;
};

// Why the weekly ads review proposed a change (operation ids are review-<rule>-<object>-<date>).
const REVIEW_REASONS: Record<string, string> = {
  kill_no_results: 'It spent more than 3x your target cost per result without a single result.',
  adset_cpa_high: 'Its cost per result is well above target; less budget here, more for what works.',
  spend_concentration: 'It takes most of the budget but brings few of the results.',
  adset_winner: 'Its cost per result is well below target over enough results to trust; a 20% raise lets it grow without resetting learning.'
};

/** Plain-language title for an ads journal operation. */
export function describeAdsOperation(op: any): { title: string; description: string } {
  const args = op.args ?? {};
  const object = args.objectId ? ` ${args.objectId}` : '';
  const reviewRule = /^review-([a-z_]+)-/.exec(op.id ?? '')?.[1];
  const reason = reviewRule && REVIEW_REASONS[reviewRule];
  if (/^meta_ads_update_/.test(op.tool) && args.data?.status === 'PAUSED') return { title: `Pause ${op.tool.replace('meta_ads_update_', '')}${object}?`, description: reason || (op.id.startsWith('fatigue-') ? 'Its results dropped more than 20% versus the week before (fewer clicks, higher cost per result).' : 'Stop delivery of this item.') };
  // ponytail: Meta minor units /100; wrong for zero-decimal currencies (JPY, KRW).
  if (/^meta_ads_update_/.test(op.tool) && args.data?.daily_budget) return { title: `Change daily budget${object} to ${args.data.daily_budget / 100}?`, description: reason || 'New daily budget in account currency.' };
  if (op.tool === 'ads_launch_meta') return { title: 'Launch a new Meta campaign (created paused)', description: 'One approval covers the campaign, ad set, creative image and copy, and ad. Everything starts paused; activation is a separate decision.' };
  if (op.tool === 'ads_publish_meta_creative') return { title: 'Publish image and copy to Meta', description: 'One approval uploads this image and creates the creative with the copy, Page, destination and CTA shown below. No ad is activated.' };
  return { title: op.tool.replace(/_/g, ' '), description: `Account ${args.accountId ?? 'n/a'}${object}` };
}

export async function inbox(ctx: ConsoleContext): Promise<InboxItem[]> {
  try {
    const ops = await adsRun(ctx.ads, 'ads_list_operations', { statuses: ['PENDING_APPROVAL'] });
    return (Array.isArray(ops) ? ops : []).map((op: any) => ({
      kind: 'ads' as const, id: op.id, ...describeAdsOperation(op), createdAt: Date.parse(op.transitions?.[0]?.at ?? '') || Date.now(),
      details: { tool: op.tool, accountId: op.args?.accountId, change: op.args?.data ?? op.args }
    })).sort((a, b) => a.createdAt - b.createdAt);
  } catch { return []; /* ads not configured: nothing to approve */ }
}

/** "Yes, do it" on an ad change = approve + dispatch in one call; the journal still owns idempotency and verification. */
export async function decide(ctx: ConsoleContext, kind: string, id: string, yes: boolean, feedback?: string) {
  if (feedback) ctx.tracking.log('client', 'feedback', feedback.slice(0, 500), id);
  if (kind === 'ads') {
    const decided = await adsRun(ctx.ads, yes ? 'ads.operation.approve' : 'ads.operation.reject', { operationId: id });
    if (!yes) return { kind, id, status: decided?.status ?? 'REJECTED' };
    const result = await adsRun(ctx.ads, 'ads.operation.resume', { operationId: id });
    return { kind, id, status: result?.status ?? decided?.status, result };
  }
  throw new Error(`Unknown approval kind ${kind}`);
}

function weekTotals(tracking: TrackingStore) {
  return { thisWeek: tracking.totals(localDate(-7), localDate(-1)), lastWeek: tracking.totals(localDate(-14), localDate(-8)) };
}

const preview = (text: string | null, n = 240) => text && text.length > n ? `${text.slice(0, n)}…` : text;

/** Agent activity: what MCP clients and harness jobs called, how it went, and the operator's verdict on each output. */
async function agentRoute(ctx: ConsoleContext, pathname: string, req: http.IncomingMessage, sendJson: (data: any, status?: number) => void): Promise<boolean> {
  const q = new URL(req.url ?? '', 'http://x').searchParams;
  if (pathname === '/api/console/agent' && req.method === 'GET') {
    const days = Math.min(Math.max(Number(q.get('days')) || 7, 1), 365);
    const since = Date.now() - days * 86_400_000;
    const rated = q.get('rated') === 'bad' ? -1 : q.get('rated') === 'good' ? 1 : undefined;
    const calls = ctx.tracking.toolCalls({ since, limit: 200, client: q.get('client') || undefined, tool: q.get('tool') || undefined,
      failed: q.get('status') === 'failed' ? true : q.get('status') === 'ok' ? false : undefined, rated })
      .map(c => ({ ...c, args: preview(c.args), output: preview(c.output) }));
    sendJson({ days, stats: ctx.tracking.toolCallStats(since), calls, reports: ctx.tracking.reports('agent') });
    return true;
  }
  const call = /^\/api\/console\/agent\/calls\/(\d+)(\/rating)?$/.exec(pathname);
  if (call && !call[2] && req.method === 'GET') {
    const found = ctx.tracking.toolCall(Number(call[1]));
    if (found) sendJson({ call: found }); else sendJson({ error: 'Call not found' }, 404);
    return true;
  }
  if (call && call[2] && req.method === 'POST') {
    const body = await ctx.parseBody(req);
    if (![1, -1, null].includes(body.rating)) { sendJson({ error: 'rating must be 1, -1 or null' }, 400); return true; }
    const ok = ctx.tracking.rateToolCall(Number(call[1]), body.rating, typeof body.note === 'string' ? body.note : undefined);
    if (ok) sendJson({ ok }); else sendJson({ error: 'Call not found' }, 404);
    return true;
  }
  if (pathname === '/api/console/agent/report' && req.method === 'POST') {
    const { id, report } = saveAgentReport(ctx.tracking);
    ctx.tracking.log('operator', 'report.agent', report.headline, id);
    sendJson({ id, report });
    return true;
  }
  sendJson({ error: 'Not found' }, 404);
  return true;
}

export async function handleConsoleRoute(ctx: ConsoleContext, pathname: string, req: http.IncomingMessage, sendJson: (data: any, status?: number) => void): Promise<boolean> {
  if (!pathname.startsWith('/api/console/')) return false;
  try {
    if (pathname === '/api/console/home' && req.method === 'GET') {
      const items = await inbox(ctx);
      sendJson({ summary: ctx.tracking.summary(), ...weekTotals(ctx.tracking), pending: items.length, activity: ctx.tracking.activity({ limit: 15 }) });
      return true;
    }
    if (pathname === '/api/console/approvals' && req.method === 'GET') { sendJson({ items: await inbox(ctx) }); return true; }
    const decision = /^\/api\/console\/approvals\/(ads)\/([^/]+)$/.exec(pathname);
    if (decision && req.method === 'POST') {
      const body = await ctx.parseBody(req);
      if (!['yes', 'no'].includes(body.decision)) { sendJson({ error: 'decision must be yes or no' }, 400); return true; }
      sendJson(await decide(ctx, decision[1], decodeURIComponent(decision[2]), body.decision === 'yes', typeof body.feedback === 'string' ? body.feedback : undefined));
      return true;
    }
    if (pathname === '/api/console/progress' && req.method === 'GET') {
      sendJson({ milestones: ctx.tracking.milestones(), summary: ctx.tracking.summary() }); return true;
    }
    if (pathname === '/api/console/activity' && req.method === 'GET') {
      sendJson({ activity: ctx.tracking.activity({ limit: 100 }) }); return true;
    }
    if (pathname === '/api/console/results' && req.method === 'GET') {
      sendJson({ kpis: ctx.tracking.kpis(localDate(-84), localDate(0)), ...weekTotals(ctx.tracking), reports: ctx.tracking.reports().filter(r => r.kind !== 'agent') }); return true;
    }
    if (pathname.startsWith('/api/console/agent')) return await agentRoute(ctx, pathname, req, sendJson);
    const report = /^\/api\/console\/reports\/([^/]+)$/.exec(pathname);
    if (report && req.method === 'GET') {
      const data = ctx.tracking.report(decodeURIComponent(report[1]));
      if (data) sendJson({ report: data }); else sendJson({ error: 'Report not found' }, 404);
      return true;
    }
  } catch (error) {
    sendJson({ error: error instanceof Error ? error.message : String(error) }, 400); return true;
  }
  sendJson({ error: 'Not found' }, 404);
  return true;
}
