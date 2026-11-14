import { MCPClient } from '../../../mcp/mcp-client.js';
import type { AdsDirectConfig } from './ads-config.js';
import { AdsService } from '../service.js';
import { TokenStore } from '../../../mcp/auth/token-store.js';
import { accountCurrency } from '../measurement.js';
import { metaLeads } from '../../../core/tracking/kpi-snapshot.js';

function dates(range = 'last_30_days') {
  const match = /^last_(\d+)_days$/.exec(range);
  if (!match) throw new Error('dateRange must be last_N_days');
  const days = Number(match[1]);
  if (days < 1 || days > 365) throw new Error('Date range must be 1..365 days');
  const until = new Date(); until.setUTCDate(until.getUTCDate() - 1);
  const since = new Date(until); since.setUTCDate(since.getUTCDate() - days + 1);
  return { since: since.toISOString().slice(0,10), until: until.toISOString().slice(0,10) };
}
export function registerDirectAdapters(client: MCPClient, cfg: AdsDirectConfig): void {
  for (const [key, platform, server] of [['google_ads','google','google-ads-mcp'],['meta_ads','meta','meta-ads-mcp'],['ga4','ga4','ga4-mcp']] as const) {
    const config = cfg[key];
    if (config.mode === 'off') continue;
    const token = process.env[key === 'google_ads' ? 'ADS_DIRECT_GOOGLE_ACCESS_TOKEN' : key === 'meta_ads' ? 'ADS_DIRECT_META_ACCESS_TOKEN' : 'ADS_DIRECT_GA4_ACCESS_TOKEN'] ?? TokenStore.getInstance().getAccessToken(key) ?? undefined;
    if (!token) throw new Error(`${key}: credentials missing; simulation fallback is disabled`);
    // Account allowlists come from the one ads policy file (config/ads-module.yaml);
    // defaultAccountId only fills in an omitted accountId and never widens the allowlist.
    const service = new AdsService({ mode: config.mode === 'dry-run' ? 'dry-run' : 'review', platforms: [platform], tokens: { [platform]: token } });
    const account = (a: any) => a.accountId ?? a.customerId ?? a.adAccountId ?? config.defaultAccountId;
    const read = async (tool: string, args: Record<string, unknown>) => (await service.call(tool, args)).data;
    const register = (name: string, handler: (a: any) => Promise<any>) => client.registerTool(server, { name, description: name, parameters: {}, handler });
    for (const tool of service.listTools().filter(t => t.platform === platform)) client.registerTool(server, {
      name: tool.name, description: tool.description, parameters: tool.parameters, handler: a => service.call(tool.name, { ...a, ...(a.accountId || !(tool.parameters as any).properties?.accountId ? {} : { accountId: config.defaultAccountId }) })
    });
    if (platform === 'google') {
      register('google_ads_get_campaign_performance', async a => {
        const d = dates(a.dateRange);
        if (a.campaignId && !/^\d+$/.test(a.campaignId)) throw new Error('Invalid campaign ID');
        const currency = await accountCurrency(read, 'google', account(a));
        const result = await service.call('google_ads_search', { accountId: account(a), query: `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date BETWEEN '${d.since}' AND '${d.until}'${a.campaignId ? ' AND campaign.id = ' + a.campaignId : ''}` });
        return { success: true, source: 'live', currency, campaigns: (result.data.results ?? []).map((r: any) => {
          const spend = Number(r.metrics.costMicros) / 1000000, revenue = Number(r.metrics.conversionsValue);
          return { id: r.campaign.id, name: r.campaign.name, status: r.campaign.status, spend, revenue, clicks: Number(r.metrics.clicks), impressions: Number(r.metrics.impressions), conversions: Number(r.metrics.conversions), ctr: Number(r.metrics.ctr), roas: spend > 0 ? revenue / spend : null };
        }) };
      });
      register('google_ads_apply_negative_keywords', a => service.call('google_ads_mutate_campaignCriteria', { accountId: account(a), operationId: a.operationId, operations: (a.negativeKeywords ?? []).map((text: string) => ({ create: { campaign: `customers/${account(a)}/campaigns/${a.campaignId}`, negative: true, keyword: { text, matchType: 'PHRASE' } } })) }));
      register('google_ads_update_budget_and_bids', async a => {
        if (!a.campaignBudgetId || a.targetCPA !== undefined) throw new Error('Supply campaignBudgetId and newDailyBudget; use biddingStrategies/campaigns tools for bid changes');
        return service.call('google_ads_mutate_campaignBudgets', { accountId: account(a), operationId: a.operationId, operations: [{ update: { resourceName: `customers/${account(a)}/campaignBudgets/${a.campaignBudgetId}`, amountMicros: Math.round(a.newDailyBudget * 1000000) }, updateMask: 'amount_micros' }] });
      });
    }
    if (platform === 'meta') {
      register('meta_ads_get_performance_and_fatigue', async a => {
        const currency = await accountCurrency(read, 'meta', account(a));
        const result = await service.call('meta_ads_insights', { accountId: account(a), ...dates(a.dateRange ?? 'last_14_days'), level: 'ad', fields: ['ad_id','campaign_id','spend','impressions','clicks','ctr','frequency','actions','action_values'] });
        const rows = result.data.data ?? [];
        return { success: true, source: 'live', currency, dailyRows: rows, accountSummary: { spend: rows.reduce((sum: number,r: any) => sum + Number(r.spend ?? 0),0), leads: rows.reduce((sum: number, r: any) => sum + metaLeads(r.actions), 0) }, adFatigueAlerts: [], warnings: ['Fatigue requires comparable time series; qualified leads require CRM reconciliation.'] };
      });
      register('meta_ads_pause_fatigued_ad', a => service.call('meta_ads_update_ad', { accountId: account(a), objectId: a.adId, operationId: a.operationId, data: { status: 'PAUSED' } }));
      register('meta_ads_create_creative_variation', async () => { throw new Error('Use ads_launch_meta with a complete creative and media reference'); });
    }
    if (platform === 'ga4') {
      register('ga4_get_funnel_metrics', async a => {
        const d = dates(a.dateRange);
        const result = await service.call('ga4_runReport', { accountId: account(a), data: { dateRanges: [{ startDate: d.since, endDate: d.until }], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }] } });
        return { success: true, source: 'live', report: result.data, trafficSummary: { totalSessions: (result.data.rows ?? []).reduce((sum: number,r: any) => sum + Number(r.metricValues?.[0]?.value ?? 0),0) }, funnelStages: [], topLandingPages: [], detectedAnomaly: { hasAnomaly: false, evaluated: false } };
      });
      register('ga4_get_channel_attribution', async a => {
        const d = dates(a.dateRange);
        const result = await service.call('ga4_runReport', { accountId: account(a), data: { dateRanges: [{ startDate: d.since, endDate: d.until }], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }, { name: 'totalRevenue' }] } });
        return { success: true, source: 'live', report: result.data, channelContributions: result.data.rows ?? [] };
      });
    }
  }
}
