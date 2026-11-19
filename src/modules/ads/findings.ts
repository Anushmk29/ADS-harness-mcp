import { analyzeCreative } from './measurement.js';
import { metaPurchaseValue, metaResults } from '../../core/tracking/kpi-snapshot.js';
import type { AdsGoal, AdsTargets } from './service.js';

/**
 * Rules-based findings for a Meta account: no LLM, every number traceable to an insights row.
 * collectFindingsData reads the last 7 complete days and the 7 before; runRules is pure.
 * Rules come from knowledge/ads/meta-analyze-optimize-scale.md and meta-audit-checklist.md.
 */
export type Level = 'account' | 'campaign' | 'adset' | 'ad';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface Row {
  level: Level; id: string; name: string; campaignId?: string; adsetId?: string;
  spend: number; impressions: number; clicks: number; results: number; revenue: number; frequency?: number;
  /** Ad sets only, from the ad set list: daily budget in account currency and Meta's learning status. */
  dailyBudget?: number; learning?: 'LEARNING' | 'SUCCESS' | 'FAIL';
}
export interface FindingsData { accountId: string; currency?: string; since: string; until: string; days: number; current: Row[]; baseline: Row[] }
export interface Evidence { metric: string; value: number; baseline?: number; target?: number }
export interface Finding {
  rule: string; severity: Severity; entity: { level: Level; id: string; name: string; campaignId?: string; adsetId?: string };
  evidence: Evidence[]; message: string;
  /** What to do about it; the action ranker turns this into a proposed operation. */
  suggestion: 'pause' | 'scale_up' | 'scale_down' | 'refresh_creative' | 'check_tracking' | 'review' | 'wait';
}
export interface RuleSettings {
  goal: AdsGoal; targets: AdsTargets;
  /** Below this many results in the period, nothing is judged on cost (default 5). */
  minResults?: number; minImpressions?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const cost = (r: Row) => (r.results ? r.spend / r.results : null);
const ctr = (r: Row) => (r.impressions ? r.clicks / r.impressions : 0);
const roas = (r: Row) => (r.spend ? r.revenue / r.spend : null);
const entity = (r: Row) => ({ level: r.level, id: r.id, name: r.name, ...(r.campaignId ? { campaignId: r.campaignId } : {}), ...(r.adsetId ? { adsetId: r.adsetId } : {}) });
const pctChange = (cur: number, base: number) => Math.round(((cur - base) / base) * 100);

export function runRules(data: FindingsData, settings: RuleSettings): { findings: Finding[]; targetCpa: number | null; account: Row | undefined; dataStatus: 'OK' | 'INSUFFICIENT' } {
  const minResults = settings.minResults ?? 5, minImpressions = settings.minImpressions ?? 1000;
  const unit = settings.goal === 'purchase' ? 'purchase' : 'lead';
  const at = (rows: Row[], level: Level) => rows.filter(r => r.level === level);
  const baseOf = (r: Row) => data.baseline.find(b => b.level === r.level && b.id === r.id);
  const account = at(data.current, 'account')[0], accountBase = at(data.baseline, 'account')[0];
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  if (!account) return { findings, targetCpa: null, account, dataStatus: 'INSUFFICIENT' };

  // Without a configured target, the account's own baseline CPA is the yardstick (current if no baseline).
  // ponytail: account-average fallback target; set targets.cpa in ads-module.yaml for real judgement.
  const targetCpa = settings.targets.cpa ?? (accountBase && cost(accountBase)) ?? cost(account);
  const enough = account.results >= minResults;

  // 1. Tracking: clicks without any result, or results collapsing while clicks hold steady.
  if (account.clicks >= 100 && account.results === 0)
    add({ rule: 'tracking_no_results', severity: 'critical', entity: entity(account), suggestion: 'check_tracking',
      evidence: [{ metric: 'clicks', value: account.clicks }, { metric: `${unit}s`, value: 0 }],
      message: `${account.clicks} clicks but 0 ${unit}s recorded in ${data.days} days. Check that the pixel/conversion event still fires before changing any ads.` });
  else if (accountBase && accountBase.results >= minResults && account.results < accountBase.results * 0.5 && accountBase.clicks > 0 && Math.abs(account.clicks - accountBase.clicks) / accountBase.clicks <= 0.2)
    add({ rule: 'tracking_drop', severity: 'critical', entity: entity(account), suggestion: 'check_tracking',
      evidence: [{ metric: `${unit}s`, value: account.results, baseline: accountBase.results }, { metric: 'clicks', value: account.clicks, baseline: accountBase.clicks }],
      message: `${unit}s fell ${pctChange(account.results, accountBase.results)}% (${accountBase.results} to ${account.results}) while clicks stayed about the same. This usually means tracking broke, not that the ads got worse.` });

  // 2. Not enough data: say so instead of judging cost.
  if (!enough) add({ rule: 'insufficient_data', severity: 'info', entity: entity(account), suggestion: 'wait',
    evidence: [{ metric: `${unit}s`, value: account.results, target: minResults }],
    message: `Only ${account.results} ${unit}s in ${data.days} days (need ${minResults}). Cost judgements wait for more data; only spend-without-results checks run.` });

  // 3. Account-level cost and ROAS against target and trend.
  const accountCost = cost(account);
  if (enough && accountCost !== null && settings.targets.cpa && accountCost > settings.targets.cpa * 1.3)
    add({ rule: 'account_cpa_above_target', severity: 'high', entity: entity(account), suggestion: 'review',
      evidence: [{ metric: `cost_per_${unit}`, value: r2(accountCost), target: settings.targets.cpa }],
      message: `Cost per ${unit} is ${r2(accountCost)}, ${pctChange(accountCost, settings.targets.cpa)}% above the ${settings.targets.cpa} target.` });
  const baseCost = accountBase && accountBase.results >= minResults ? cost(accountBase) : null;
  if (enough && accountCost !== null && baseCost && accountCost > baseCost * 1.25)
    add({ rule: 'account_cpa_rising', severity: 'high', entity: entity(account), suggestion: 'review',
      evidence: [{ metric: `cost_per_${unit}`, value: r2(accountCost), baseline: r2(baseCost) }],
      message: `Cost per ${unit} rose ${pctChange(accountCost, baseCost)}% week over week (${r2(baseCost)} to ${r2(accountCost)}).` });
  const accountRoas = roas(account);
  if (settings.goal === 'purchase' && enough && settings.targets.roas && accountRoas !== null && accountRoas < settings.targets.roas * 0.8)
    add({ rule: 'roas_below_target', severity: 'high', entity: entity(account), suggestion: 'review',
      evidence: [{ metric: 'roas', value: r2(accountRoas), target: settings.targets.roas }],
      message: `ROAS is ${r2(accountRoas)} against a ${settings.targets.roas} target: every 1 spent returns ${r2(accountRoas)} in revenue.` });
  if (accountBase && account.impressions >= minImpressions && accountBase.impressions >= minImpressions) {
    const cpm = account.spend / account.impressions * 1000, baseCpm = accountBase.spend / accountBase.impressions * 1000;
    if (baseCpm > 0 && cpm > baseCpm * 1.4)
      add({ rule: 'cpm_spike', severity: 'low', entity: entity(account), suggestion: 'review',
        evidence: [{ metric: 'cpm', value: r2(cpm), baseline: r2(baseCpm) }],
        message: `Cost per 1,000 impressions rose ${pctChange(cpm, baseCpm)}% (${r2(baseCpm)} to ${r2(cpm)}): the auction got more expensive or the audience is narrowing.` });
  }

  // 4. Ad sets: kill rule, winners, losers, budget concentration, learning, frequency, pacing.
  const adsets = at(data.current, 'adset');
  for (const s of adsets) {
    const c = cost(s);
    if (targetCpa && s.results === 0 && s.spend > 3 * targetCpa)
      add({ rule: 'kill_no_results', severity: 'critical', entity: entity(s), suggestion: 'pause',
        evidence: [{ metric: 'spend', value: r2(s.spend), target: r2(3 * targetCpa) }, { metric: `${unit}s`, value: 0 }],
        message: `Spent ${r2(s.spend)} (over 3x the ${r2(targetCpa)} target cost per ${unit}) with no ${unit}s. 3x kill rule: pause it.` });
    else if (targetCpa && c !== null && s.results >= minResults && c > targetCpa * 1.5)
      add({ rule: 'adset_cpa_high', severity: 'high', entity: entity(s), suggestion: 'scale_down',
        evidence: [{ metric: `cost_per_${unit}`, value: r2(c), target: r2(targetCpa) }, { metric: `${unit}s`, value: s.results }],
        message: `Cost per ${unit} is ${r2(c)}, ${pctChange(c, targetCpa)}% above target over ${s.results} ${unit}s. Cut its budget 20% or move money to better ad sets.` });
    else if (targetCpa && c !== null && s.results >= Math.max(minResults, 10) && c < targetCpa * 0.7 && s.learning !== 'LEARNING')
      add({ rule: 'adset_winner', severity: 'medium', entity: entity(s), suggestion: 'scale_up',
        evidence: [{ metric: `cost_per_${unit}`, value: r2(c), target: r2(targetCpa) }, { metric: `${unit}s`, value: s.results }],
        message: `Cost per ${unit} is ${r2(c)}, ${Math.abs(pctChange(c, targetCpa))}% below target over ${s.results} ${unit}s. Room to scale: raise budget by up to 20%.` });
    if (s.learning === 'FAIL')
      add({ rule: 'learning_limited', severity: 'medium', entity: entity(s), suggestion: 'review',
        evidence: [{ metric: `${unit}s`, value: s.results }],
        message: `Meta marks this ad set "Learning limited": it is not getting the ~50 ${unit}s a week it needs to optimise. Merge it with a similar ad set or widen the audience.` });
    if (s.frequency !== undefined && s.frequency > 4)
      add({ rule: 'audience_saturation', severity: 'medium', entity: entity(s), suggestion: 'refresh_creative',
        evidence: [{ metric: 'frequency', value: r2(s.frequency) }],
        message: `People saw these ads ${r2(s.frequency)} times each on average in ${data.days} days. The audience is saturated: widen it or rotate new creative.` });
    if (s.dailyBudget && s.dailyBudget > 0 && s.spend < s.dailyBudget * data.days * 0.5)
      add({ rule: 'underspend', severity: 'low', entity: entity(s), suggestion: 'review',
        evidence: [{ metric: 'spend', value: r2(s.spend), target: r2(s.dailyBudget * data.days) }],
        message: `Spent ${r2(s.spend)} of a possible ${r2(s.dailyBudget * data.days)} (${Math.round(s.spend / (s.dailyBudget * data.days) * 100)}%). The audience may be too small or the bid too low.` });
  }
  const totalSpend = adsets.reduce((a, s) => a + s.spend, 0), totalResults = adsets.reduce((a, s) => a + s.results, 0);
  if (adsets.length >= 2 && totalSpend > 0 && totalResults >= minResults) for (const s of adsets) {
    const spendShare = s.spend / totalSpend, resultShare = s.results / totalResults;
    if (spendShare > 0.5 && resultShare < 0.25)
      add({ rule: 'spend_concentration', severity: 'medium', entity: entity(s), suggestion: 'scale_down',
        evidence: [{ metric: 'spend_share_pct', value: Math.round(spendShare * 100) }, { metric: 'result_share_pct', value: Math.round(resultShare * 100) }],
        message: `Takes ${Math.round(spendShare * 100)}% of spend but brings ${Math.round(resultShare * 100)}% of ${unit}s. Shift budget to the ad sets that convert.` });
  }

  // 5. Ads: creative fatigue (reuses analyzeCreative's mature-data rule) and weak CTR.
  const ads = at(data.current, 'ad'), accountCtr = ctr(account);
  for (const ad of ads) {
    const base = baseOf(ad);
    if (base) {
      const verdict = analyzeCreative({ adId: ad.id, baseline: { impressions: base.impressions, clicks: base.clicks, spend: base.spend, conversions: base.results },
        current: { impressions: ad.impressions, clicks: ad.clicks, spend: ad.spend, conversions: ad.results }, conversionLagElapsed: true, minimumImpressions: minImpressions, minimumConversions: minResults });
      if (verdict.recommendation === 'REVIEW_CREATIVE_TEST')
        add({ rule: 'creative_fatigue', severity: 'high', entity: entity(ad), suggestion: 'refresh_creative',
          evidence: [{ metric: 'ctr_pct', value: r2(ctr(ad) * 100), baseline: r2(ctr(base) * 100) }, { metric: `cost_per_${unit}`, value: r2(cost(ad)!), baseline: r2(cost(base)!) }],
          message: `Creative fatigue: CTR fell from ${r2(ctr(base) * 100)}% to ${r2(ctr(ad) * 100)}% and cost per ${unit} rose from ${r2(cost(base)!)} to ${r2(cost(ad)!)}. Replace it with a new creative.` });
    }
    if (ad.impressions >= minImpressions && accountCtr > 0 && ctr(ad) < accountCtr * 0.5)
      add({ rule: 'weak_ctr', severity: 'low', entity: entity(ad), suggestion: 'refresh_creative',
        evidence: [{ metric: 'ctr_pct', value: r2(ctr(ad) * 100), baseline: r2(accountCtr * 100) }],
        message: `CTR ${r2(ctr(ad) * 100)}% is under half the account's ${r2(accountCtr * 100)}%. The hook or image is not stopping the scroll.` });
    if (targetCpa && ad.results === 0 && ad.spend > 3 * targetCpa && !findings.some(f => f.rule === 'kill_no_results' && f.entity.id === ad.adsetId))
      add({ rule: 'kill_no_results', severity: 'critical', entity: entity(ad), suggestion: 'pause',
        evidence: [{ metric: 'spend', value: r2(ad.spend), target: r2(3 * targetCpa) }, { metric: `${unit}s`, value: 0 }],
        message: `This ad spent ${r2(ad.spend)} (over 3x the ${r2(targetCpa)} target cost per ${unit}) with no ${unit}s. Pause it.` });
  }

  const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || (b.evidence[0]?.value ?? 0) - (a.evidence[0]?.value ?? 0));
  return { findings, targetCpa: targetCpa ?? null, account, dataStatus: enough ? 'OK' : 'INSUFFICIENT' };
}

type Read = (tool: string, args: Record<string, unknown>) => Promise<any>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (offset: number, now: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };

/** Insights for the last 7 complete days and the 7 before, at every level, plus ad set budgets and learning status. */
export async function collectFindingsData(read: Read, accountId: string, goal: AdsGoal, now = Date.now(), days = 7): Promise<FindingsData> {
  const since = day(-days, now), until = day(-1, now), baseSince = day(-2 * days, now), baseUntil = day(-days - 1, now);
  const idField: Record<Level, string> = { account: 'account_id', campaign: 'campaign_id', adset: 'adset_id', ad: 'ad_id' };
  const nameField: Record<Level, string> = { account: 'account_name', campaign: 'campaign_name', adset: 'adset_name', ad: 'ad_name' };
  const fetch = async (level: Level, from: string, to: string): Promise<Row[]> => {
    const fields = [idField[level], nameField[level], 'spend', 'impressions', 'clicks', 'frequency', 'actions', 'action_values', ...(level === 'ad' ? ['adset_id', 'campaign_id'] : level === 'adset' ? ['campaign_id'] : [])];
    const res = await read('meta_ads_insights', { accountId, level, since: from, until: to, fields, timeIncrement: 'all_days' });
    return (res?.data ?? []).map((r: any) => ({ level, id: String(r[idField[level]] ?? accountId), name: String(r[nameField[level]] ?? r[idField[level]] ?? accountId),
      ...(r.campaign_id && level !== 'campaign' ? { campaignId: String(r.campaign_id) } : {}), ...(r.adset_id && level === 'ad' ? { adsetId: String(r.adset_id) } : {}),
      spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), frequency: r.frequency !== undefined ? num(r.frequency) : undefined,
      results: metaResults(r.actions, goal), revenue: metaPurchaseValue(r.action_values) }));
  };
  const levels: Level[] = ['account', 'campaign', 'adset', 'ad'];
  const current = (await Promise.all(levels.map(l => fetch(l, since, until)))).flat();
  const baseline = (await Promise.all(levels.map(l => fetch(l, baseSince, baseUntil)))).flat();
  // Budgets and learning status are optional context; a failed read must not hide the findings.
  try {
    const list = await read('meta_ads_list_adset', { accountId, fields: ['id', 'daily_budget', 'learning_stage_info', 'effective_status'], params: { limit: 500 } });
    const byId = new Map<string, any>((list?.data ?? []).map((a: any) => [String(a.id), a]));
    for (const row of current) if (row.level === 'adset') {
      const info = byId.get(row.id);
      // ponytail: Meta budgets are in minor units; /100 is wrong for zero-decimal currencies (JPY, KRW...).
      if (info?.daily_budget) row.dailyBudget = num(info.daily_budget) / 100;
      const status = info?.learning_stage_info?.status;
      if (status === 'LEARNING' || status === 'SUCCESS' || status === 'FAIL') row.learning = status;
    }
  } catch { /* no budget context */ }
  return { accountId, since, until, days, current, baseline };
}
