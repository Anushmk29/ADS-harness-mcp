import { analyzeCreative } from './measurement.js';
import { metaResults } from '../../core/tracking/kpi-snapshot.js';

type Call = (tool: string, args: Record<string, unknown>) => Promise<any>;
const day = (offset: number, now: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Weekly creative-fatigue check: last 7 days vs the 7 before, per ad, through analyzeCreative's 20% CTR/CPA rule.
 * A fatigued ad becomes a PAUSE proposal in the ads journal (PENDING_APPROVAL in live-with-approval mode); nothing auto-pauses.
 */
export async function checkFatigue(read: Call, propose: Call, accountId: string, options: { now?: number; minimumImpressions?: number; minimumConversions?: number; goal?: 'lead' | 'purchase' } = {}) {
  const now = options.now ?? Date.now();
  const fields = ['ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'actions'];
  const window = async (since: number, until: number) => {
    const res = await read('meta_ads_insights', { accountId, level: 'ad', since: day(since, now), until: day(until, now), fields, timeIncrement: 'all_days' });
    return new Map<string, any>((res?.data ?? []).map((r: any) => [String(r.ad_id), r]));
  };
  const [baseline, current] = [await window(-14, -8), await window(-7, -1)];
  const results: any[] = [];
  for (const [adId, cur] of current) {
    const base = baseline.get(adId);
    if (!base) continue;
    const stats = (r: any) => ({ impressions: num(r.impressions), clicks: num(r.clicks), spend: num(r.spend), conversions: metaResults(r.actions, options.goal) });
    const verdict = analyzeCreative({ adId, baseline: stats(base), current: stats(cur), conversionLagElapsed: true,
      minimumImpressions: options.minimumImpressions ?? 1000, minimumConversions: options.minimumConversions ?? 5 });
    let proposal: any;
    if (verdict.recommendation === 'REVIEW_CREATIVE_TEST') {
      proposal = await propose('meta_ads_update_ad', { accountId, objectId: adId, data: { status: 'PAUSED' }, operationId: `fatigue-${adId}-${day(-1, now)}` })
        .catch((e: Error) => ({ status: 'FAILED', error: e.message }));
    }
    results.push({ ...verdict, adId, adName: cur.ad_name, proposal: proposal && { status: proposal.status, operationId: proposal.id ?? proposal.operationId, error: proposal.error } });
  }
  return { accountId, checked: results.length, fatigued: results.filter(r => r.recommendation === 'REVIEW_CREATIVE_TEST'), results };
}
