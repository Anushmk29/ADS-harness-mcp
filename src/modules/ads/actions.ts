import type { Finding, FindingsData, Severity } from './findings.js';

/**
 * Next-step engine: turns findings into ranked actions. Writes are only *proposed*: each one goes through
 * AdsService.call, so the allowlist, budget ceiling, forced-PAUSED and exact-approval gates all still apply.
 */
export interface Action {
  rank: number; score: number; rule: string; title: string; why: string;
  entity: Finding['entity'];
  /** Present when the harness can do it after approval; absent means a person has to do it. */
  operation?: { tool: string; args: Record<string, unknown> };
  manualStep?: string;
}

const SEVERITY: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
// How sure each rule is, and how risky its action is (pausing a dead ad set is safe; scaling up spends more).
const CONFIDENCE: Record<string, number> = { kill_no_results: 0.9, tracking_no_results: 0.9, tracking_drop: 0.8, creative_fatigue: 0.8, adset_cpa_high: 0.7, adset_winner: 0.7, spend_concentration: 0.6 };
const RISK: Record<Finding['suggestion'], number> = { pause: 1, check_tracking: 1, refresh_creative: 1, scale_down: 1, review: 1.2, scale_up: 1.5, wait: 1 };
const SCALE_STEP = 0.2; // the 20% scaling rule

export function rankActions(findings: Finding[], data: FindingsData): Action[] {
  const spendOf = (id: string) => data.current.find(r => r.id === id)?.spend ?? 0;
  const budgetOf = (id: string) => data.current.find(r => r.level === 'adset' && r.id === id)?.dailyBudget;
  const actions: Omit<Action, 'rank'>[] = [];
  // Tracking problems make every cost-based judgement unreliable: only the tracking fix is proposed.
  const trackingBroken = findings.some(f => f.suggestion === 'check_tracking');
  for (const f of findings) {
    if (f.suggestion === 'wait' || (trackingBroken && f.suggestion !== 'check_tracking')) continue;
    const score = Math.round(SEVERITY[f.severity] * Math.log10(spendOf(f.entity.id) + 10) * (CONFIDENCE[f.rule] ?? 0.5) / RISK[f.suggestion] * 100) / 100;
    const base = { score, rule: f.rule, why: f.message, entity: f.entity };
    const label = `${f.entity.level} "${f.entity.name}"`;
    const level = f.entity.level;
    if (f.suggestion === 'pause' && (level === 'adset' || level === 'ad'))
      actions.push({ ...base, title: `Pause ${label}`, operation: { tool: `meta_ads_update_${level}`, args: { accountId: data.accountId, objectId: f.entity.id, data: { status: 'PAUSED' } } } });
    else if ((f.suggestion === 'scale_up' || f.suggestion === 'scale_down') && level === 'adset') {
      const budget = budgetOf(f.entity.id), factor = f.suggestion === 'scale_up' ? 1 + SCALE_STEP : 1 - SCALE_STEP;
      const verb = f.suggestion === 'scale_up' ? 'Raise' : 'Cut';
      // Meta daily_budget is in minor units (budget was divided by 100 on read).
      if (budget) actions.push({ ...base, title: `${verb} ${label} daily budget ${Math.round(SCALE_STEP * 100)}% (${budget} to ${Math.round(budget * factor * 100) / 100})`,
        operation: { tool: 'meta_ads_update_adset', args: { accountId: data.accountId, objectId: f.entity.id, data: { daily_budget: Math.round(budget * factor * 100) } } } });
      else actions.push({ ...base, title: `${verb} budget for ${label} by ${Math.round(SCALE_STEP * 100)}%`, manualStep: 'Budget is set at campaign level (Advantage campaign budget): change it in Ads Manager or shift it between ad sets.' });
    }
    else if (f.suggestion === 'refresh_creative') actions.push({ ...base, title: `New creative for ${label}`, manualStep: 'Brief 2-3 new creatives on a different hook/format; launch them PAUSED in the same ad set, then pause this one once they run.' });
    else if (f.suggestion === 'check_tracking') actions.push({ ...base, title: 'Check conversion tracking', manualStep: 'Open Events Manager: confirm the pixel/CAPI event fired in the last 24h and the ad sets optimise for that event.' });
    else actions.push({ ...base, title: `Review ${label}`, manualStep: f.message });
  }
  // One action per entity: keep the highest-scoring.
  const best = new Map<string, Omit<Action, 'rank'>>();
  for (const a of actions) { const key = `${a.entity.level}:${a.entity.id}`; if (!best.has(key) || best.get(key)!.score < a.score) best.set(key, a); }
  return [...best.values()].sort((a, b) => b.score - a.score).map((a, i) => ({ rank: i + 1, ...a }));
}

type Call = (tool: string, args: Record<string, unknown>) => Promise<any>;

/** Submit the top writeable actions for approval. operationId is stable per rule/object/period, so reruns do not duplicate. */
export async function proposeActions(actions: Action[], call: Call, period: string, limit = 5) {
  const proposals = [];
  for (const a of actions.filter(a => a.operation).slice(0, limit)) {
    const operationId = `review-${a.rule}-${a.entity.id}-${period}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    const result = await call(a.operation!.tool, { ...a.operation!.args, operationId }).catch((e: Error) => ({ status: 'FAILED', error: e.message }));
    proposals.push({ rank: a.rank, title: a.title, operationId, status: result?.status, error: result?.error });
  }
  return proposals;
}
