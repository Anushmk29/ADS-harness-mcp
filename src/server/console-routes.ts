// Client console API: one place for the screens the client sees (Home, Approvals, Progress, Results).
import type http from 'node:http';
import type { TrackingStore } from '../core/tracking/store.js';
import type { MarketingModule } from '../core/modules/contracts.js';
import { localDate } from '../core/tracking/kpi-snapshot.js';

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

/** Plain-language title for an ads journal operation. */
export function describeAdsOperation(op: any): { title: string; description: string } {
  const args = op.args ?? {};
  const object = args.objectId ? ` ${args.objectId}` : '';
  if (/^meta_ads_update_/.test(op.tool) && args.data?.status === 'PAUSED') return { title: `Pause ${op.tool.replace('meta_ads_update_', '')}${object}?`, description: op.id.startsWith('fatigue-') ? 'Its results dropped more than 20% versus the week before (fewer clicks, higher cost per lead).' : 'Stop delivery of this item.' };
  if (/^meta_ads_update_/.test(op.tool) && args.data?.daily_budget) return { title: `Change daily budget${object}`, description: `New daily budget: ${args.data.daily_budget} (account currency, minor units).` };
  if (op.tool === 'ads_launch_meta') return { title: 'Launch a new Meta campaign (created paused)', description: 'Creates the campaign, ad set and ads paused so you can check them before anything spends.' };
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
      sendJson({ kpis: ctx.tracking.kpis(localDate(-84), localDate(0)), ...weekTotals(ctx.tracking), reports: ctx.tracking.reports() }); return true;
    }
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
