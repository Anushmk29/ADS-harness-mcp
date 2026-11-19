import type { TrackingStore } from './store.js';
import { accountCurrency } from '../../modules/ads/measurement.js';

/** Calls one ads/analytics read tool and returns its `data` (AdsService.call shape). */
export type AdsRead = (tool: string, args: Record<string, unknown>) => Promise<any>;
export interface SnapshotAccounts { meta?: string[]; google?: string[]; ga4?: string[] }

/** YYYY-MM-DD for `offsetDays` from now in the process timezone (set TZ to the client's). */
export function localDate(offsetDays = 0, now = Date.now()): string {
  const d = new Date(now); d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA');
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const META_LEAD_TYPES = ['onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped'];

const META_PURCHASE_TYPES = ['offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase', 'onsite_conversion.purchase'];
type MetaActions = Array<{ action_type: string; value: string }>;

/** Meta's aggregate action (`lead` / `purchase`) already includes its sub-types; only sum those when it is absent. */
function metaAction(actions: MetaActions = [], aggregate: string, subTypes: string[]): number {
  const byType = new Map(actions.map(a => [a.action_type, num(a.value)]));
  return byType.has(aggregate) ? byType.get(aggregate)! : subTypes.reduce((s, t) => s + (byType.get(t) ?? 0), 0);
}
export const metaLeads = (actions?: MetaActions) => metaAction(actions, 'lead', META_LEAD_TYPES);
export const metaPurchases = (actions?: MetaActions) => metaAction(actions, 'purchase', META_PURCHASE_TYPES);
/** Purchase revenue from `action_values` (same aggregate rule as the counts). */
export const metaPurchaseValue = (actionValues?: MetaActions) => metaAction(actionValues, 'purchase', META_PURCHASE_TYPES);
/** Results for the client's goal: leads, or purchases. */
export const metaResults = (actions: MetaActions | undefined, goal: 'lead' | 'purchase' = 'lead') => goal === 'purchase' ? metaPurchases(actions) : metaLeads(actions);

/**
 * One row per (date, channel, metric) for yesterday, summed across the client's configured accounts.
 * Each platform is independent: one failing provider does not lose the others' numbers.
 */
export async function snapshotKpis(store: TrackingStore, read: AdsRead, accounts: SnapshotAccounts, date = localDate(-1), goal: 'lead' | 'purchase' = 'lead') {
  const totals: Record<string, Record<string, number>> = {};
  const add = (channel: string, metric: string, value: number) => { (totals[channel] ??= {})[metric] = (totals[channel][metric] ?? 0) + value; };
  const errors: string[] = [];
  const currencies = new Set<string>();
  let metaAccounts: Promise<any> | undefined;
  const currencyRead: AdsRead = (tool, args) => tool === 'meta_ads_list_accounts' ? metaAccounts ??= read(tool, args) : read(tool, args);
  const run = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (e: any) { errors.push(`${label}: ${e.message}`); } };

  for (const accountId of accounts.meta ?? []) await run(`meta ${accountId}`, async () => {
    currencies.add(await accountCurrency(currencyRead, 'meta', accountId));
    const res = await read('meta_ads_insights', { accountId, level: 'account', since: date, until: date, fields: ['spend', 'impressions', 'clicks', 'actions', 'action_values'], timeIncrement: 1 });
    for (const row of res?.data ?? []) {
      add('meta', 'spend', num(row.spend)); add('meta', 'impressions', num(row.impressions));
      add('meta', 'clicks', num(row.clicks)); add('meta', 'leads', metaLeads(row.actions));
      add('meta', 'purchases', metaPurchases(row.actions)); add('meta', 'revenue', metaPurchaseValue(row.action_values));
    }
  });
  for (const accountId of accounts.google ?? []) await run(`google ${accountId}`, async () => {
    currencies.add(await accountCurrency(currencyRead, 'google', accountId));
    const res = await read('google_ads_search', { accountId, query: `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date = '${date}'` });
    for (const row of res?.results ?? []) {
      add('google', 'spend', num(row.metrics?.costMicros) / 1e6); add('google', 'impressions', num(row.metrics?.impressions));
      // Google has one conversions column; it counts toward the client's goal metric.
      add('google', 'clicks', num(row.metrics?.clicks)); add('google', goal === 'purchase' ? 'purchases' : 'leads', num(row.metrics?.conversions));
      add('google', 'revenue', num(row.metrics?.conversionsValue));
    }
  });
  for (const accountId of accounts.ga4 ?? []) await run(`ga4 ${accountId}`, async () => {
    const res = await read('ga4_runReport', { accountId, data: { dateRanges: [{ startDate: date, endDate: date }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }, { name: 'totalUsers' }] } });
    const values = res?.rows?.[0]?.metricValues ?? [];
    add('ga4', 'sessions', num(values[0]?.value)); add('ga4', 'conversions', num(values[1]?.value)); add('ga4', 'users', num(values[2]?.value));
  });

  if (currencies.size > 1) throw new Error(`Mixed account currencies (${[...currencies].join(', ')}); normalize amounts before importing them`);
  for (const currency of currencies) store.ensureCurrency(currency);
  for (const [channel, metrics] of Object.entries(totals)) for (const [metric, value] of Object.entries(metrics)) store.upsertKpi(date, channel, metric, value);
  const sum = (metric: string) => (totals.meta?.[metric] ?? 0) + (totals.google?.[metric] ?? 0);
  const spend = sum('spend'), leads = sum('leads'), purchases = sum('purchases'), revenue = sum('revenue');
  if (spend > 0) {
    store.upsertKpi(date, 'all', 'spend', spend); store.upsertKpi(date, 'all', 'leads', leads);
    if (leads > 0) store.upsertKpi(date, 'all', 'cpl', spend / leads);
    if (purchases > 0 || revenue > 0) { store.upsertKpi(date, 'all', 'purchases', purchases); store.upsertKpi(date, 'all', 'revenue', revenue); }
  }
  const attempted = (accounts.meta?.length ?? 0) + (accounts.google?.length ?? 0) + (accounts.ga4?.length ?? 0);
  return { date, channels: Object.keys(totals), errors, allFailed: attempted > 0 && errors.length === attempted };
}
