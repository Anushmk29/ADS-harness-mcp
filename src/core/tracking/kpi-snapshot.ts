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

/** Meta's `lead` action already aggregates the lead sub-types; only sum those when it is absent. */
export function metaLeads(actions: Array<{ action_type: string; value: string }> = []): number {
  const byType = new Map(actions.map(a => [a.action_type, num(a.value)]));
  return byType.has('lead') ? byType.get('lead')! : META_LEAD_TYPES.reduce((s, t) => s + (byType.get(t) ?? 0), 0);
}

/**
 * One row per (date, channel, metric) for yesterday, summed across the client's configured accounts.
 * Each platform is independent: one failing provider does not lose the others' numbers.
 */
export async function snapshotKpis(store: TrackingStore, read: AdsRead, accounts: SnapshotAccounts, date = localDate(-1)) {
  const totals: Record<string, Record<string, number>> = {};
  const add = (channel: string, metric: string, value: number) => { (totals[channel] ??= {})[metric] = (totals[channel][metric] ?? 0) + value; };
  const errors: string[] = [];
  const currencies = new Set<string>();
  let metaAccounts: Promise<any> | undefined;
  const currencyRead: AdsRead = (tool, args) => tool === 'meta_ads_list_accounts' ? metaAccounts ??= read(tool, args) : read(tool, args);
  const run = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (e: any) { errors.push(`${label}: ${e.message}`); } };

  for (const accountId of accounts.meta ?? []) await run(`meta ${accountId}`, async () => {
    currencies.add(await accountCurrency(currencyRead, 'meta', accountId));
    const res = await read('meta_ads_insights', { accountId, level: 'account', since: date, until: date, fields: ['spend', 'impressions', 'clicks', 'actions'], timeIncrement: 1 });
    for (const row of res?.data ?? []) {
      add('meta', 'spend', num(row.spend)); add('meta', 'impressions', num(row.impressions));
      add('meta', 'clicks', num(row.clicks)); add('meta', 'leads', metaLeads(row.actions));
    }
  });
  for (const accountId of accounts.google ?? []) await run(`google ${accountId}`, async () => {
    currencies.add(await accountCurrency(currencyRead, 'google', accountId));
    const res = await read('google_ads_search', { accountId, query: `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM customer WHERE segments.date = '${date}'` });
    for (const row of res?.results ?? []) {
      add('google', 'spend', num(row.metrics?.costMicros) / 1e6); add('google', 'impressions', num(row.metrics?.impressions));
      add('google', 'clicks', num(row.metrics?.clicks)); add('google', 'leads', num(row.metrics?.conversions));
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
  const spend = (totals.meta?.spend ?? 0) + (totals.google?.spend ?? 0), leads = (totals.meta?.leads ?? 0) + (totals.google?.leads ?? 0);
  if (spend > 0) { store.upsertKpi(date, 'all', 'spend', spend); store.upsertKpi(date, 'all', 'leads', leads); if (leads > 0) store.upsertKpi(date, 'all', 'cpl', spend / leads); }
  const attempted = (accounts.meta?.length ?? 0) + (accounts.google?.length ?? 0) + (accounts.ga4?.length ?? 0);
  return { date, channels: Object.keys(totals), errors, allFailed: attempted > 0 && errors.length === attempted };
}
