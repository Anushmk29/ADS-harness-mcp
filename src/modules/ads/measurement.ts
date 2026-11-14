export async function accountCurrency(read: (tool: string, args: Record<string, unknown>) => Promise<any>, platform: 'meta' | 'google', accountId: string): Promise<string> {
  if (typeof accountId !== 'string' || !/^(?:act_)?\d+$/.test(accountId)) throw new Error('Supply the account ID before requesting account currency');
  const result = platform === 'meta'
    ? await read('meta_ads_list_accounts', {})
    : await read('google_ads_search', { accountId, query: 'SELECT customer.currency_code FROM customer' });
  const currency = platform === 'meta'
    ? result?.data?.find((account: any) => String(account.id).replace(/^act_/, '') === accountId.replace(/^act_/, ''))?.currency
    : result?.results?.[0]?.customer?.currencyCode;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error(`Cannot confirm currency for ${platform} account ${accountId}`);
  return currency;
}

export function comparePerformance(input: any) {
  const seen = new Set<string>();
  for (const channel of input.channels) {
    if (channel.currency !== input.currency) throw new Error('Normalize currency with an explicit FX source before comparison');
    if (seen.has(channel.platform)) throw new Error('Provide one aggregated row per platform');
    seen.add(channel.platform);
  }
  const orders = new Map<string, number>();
  for (const order of input.orders ?? []) {
    if (order.currency !== input.currency) throw new Error('Order currency differs from report currency');
    if (orders.has(order.orderId) && orders.get(order.orderId) !== order.revenue) throw new Error('Conflicting revenue for duplicate order');
    orders.set(order.orderId, order.revenue);
  }
  const spend = input.channels.reduce((sum: number, c: any) => sum + c.spend, 0);
  const revenue = input.orders === undefined ? null : [...orders.values()].reduce((a,b) => a+b, 0);
  return { source: 'supplied_data', currency: input.currency, since: input.since, until: input.until,
    channels: input.channels.map((c: any) => ({ ...c, platformRoas: c.spend && c.attributedRevenue !== undefined ? c.attributedRevenue / c.spend : null,
      cpql: c.qualifiedLeads ? c.spend / c.qualifiedLeads : null, cac: c.newCustomers ? c.spend / c.newCustomers : null })),
    blended: { spend, deduplicatedRevenue: revenue, roas: revenue !== null && spend > 0 ? revenue / spend : null, orders: input.orders === undefined ? null : orders.size },
    warnings: ['Platform attribution models/windows must be aligned before ranking channels. Supplied orders must match the report period and acquisition scope.'] };
}
export function analyzeCreative(a: any) {
  const { baseline: b, current: c } = a;
  if (b.clicks > b.impressions || c.clicks > c.impressions) throw new Error('Clicks cannot exceed impressions for this analysis');
  if (!a.conversionLagElapsed || Math.min(b.impressions,c.impressions) < a.minimumImpressions || Math.min(b.conversions,c.conversions) < a.minimumConversions)
    return { adId: a.adId, recommendation: 'WAIT_FOR_EVIDENCE', reason: 'Insufficient mature conversion/impression data' };
  const baselineCtr = b.clicks / b.impressions, currentCtr = c.clicks / c.impressions;
  const baselineCpa = b.spend / b.conversions, currentCpa = c.spend / c.conversions;
  const decayed = baselineCtr > 0 && currentCtr < baselineCtr * 0.8;
  const worsened = baselineCpa > 0 && currentCpa > baselineCpa * 1.2;
  // ponytail: fixed 20% heuristic, replace with an experiment model once enough history exists.
  return { adId: a.adId, baselineCtr, currentCtr, baselineCpa, currentCpa,
    recommendation: decayed && worsened ? 'REVIEW_CREATIVE_TEST' : 'MAINTAIN_AND_MONITOR',
    automatedPause: false, source: 'supplied_data', heuristic: 'CTR decrease and CPA increase greater than 20% in mature comparable periods' };
}
