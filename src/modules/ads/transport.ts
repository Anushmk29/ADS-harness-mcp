import type { AdsTool, Platform } from './tools.js';
import { MetaMcpClient, MetaMcpToolError, type MetaMcpCaller } from './meta-mcp/client.js';

export interface ProviderOptions {
  tokens?: Partial<Record<Platform, string>>;
  fetch?: typeof fetch;
  metaVersion?: string;
  googleVersion?: string;
  /** Meta Ads MCP client; defaults to the real server with the Meta token. */
  metaMcp?: MetaMcpCaller;
  /** Backoff for retried reads; default 1s, 4s, 15s. Writes are never retried (the journal's UNCERTAIN path owns them). */
  retryDelaysMs?: number[];
}
export class ProviderError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export class HierarchyDispatchError extends Error {
  constructor(message: string, public partial: any, public outcome: 'FAILED' | 'PARTIAL' | 'UNCERTAIN') { super(message); }
}
export class AdsTransport {
  private fetcher: typeof fetch;
  private refreshedTokens: Partial<Record<Platform, { token: string; expiresAt: number }>> = {};
  private refreshing: Partial<Record<Platform, Promise<string>>> = {};
  /** Page access tokens derived from the Meta token; memory only, never logged or persisted. */
  private pageTokens = new Map<string, { token: string; expiresAt: number }>();
  constructor(private options: ProviderOptions = {}) { this.fetcher = options.fetch ?? globalThis.fetch; }
  async token(platform: Platform): Promise<string> {
    const env = platform === 'meta' ? 'ADS_DIRECT_META_ACCESS_TOKEN' : platform === 'google' ? 'ADS_DIRECT_GOOGLE_ACCESS_TOKEN' : 'ADS_DIRECT_GA4_ACCESS_TOKEN';
    const token = this.options.tokens?.[platform] ?? process.env[env];
    if (token) return token;
    const cached = this.refreshedTokens[platform];
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
    if (this.refreshing[platform]) return this.refreshing[platform]!;
    const prefix = platform === 'ga4' ? 'GA4' : 'GOOGLE';
    // One `google-auth` sign-in can cover GA4 + Ads: GOOGLE_REFRESH_TOKEN is the shared fallback.
    const refresh = process.env[`ADS_DIRECT_${prefix}_REFRESH_TOKEN`] ?? process.env.GOOGLE_REFRESH_TOKEN;
    if (platform !== 'meta' && refresh && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const pending = (async () => {
        const res = await this.fetcher('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(30000), body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! }) });
        if (!res.ok) throw new Error(`${platform} token refresh failed (${res.status}); reauthorize the account`);
        const body = await res.json() as any;
        if (!body.access_token) throw new Error('OAuth response omitted access_token');
        this.refreshedTokens[platform] = { token: body.access_token, expiresAt: Date.now() + Math.max(0, Number(body.expires_in) || 0) * 1000 };
        return body.access_token as string;
      })();
      this.refreshing[platform] = pending;
      try { return await pending; } finally { delete this.refreshing[platform]; }
    }
    throw new Error(`Missing ${env} (or supported Google refresh credentials)`);
  }
  /** Reads that are safe to repeat: GETs, and POST endpoints that only query (Google search, GA4 reports). */
  private isRead(url: URL, method: string): boolean {
    return method === 'GET' || url.pathname.endsWith('googleAds:search') || /:run\w*Report$/.test(url.pathname);
  }
  private retryDelay(retries: number, retryAfter: string | null): number {
    const delays = this.options.retryDelaysMs ?? [1000, 4000, 15000];
    const seconds = retryAfter === null || retryAfter.trim() === '' ? NaN : Number(retryAfter);
    return Number.isFinite(seconds) ? Math.min(60_000, seconds * 1000) : delays[Math.min(delays.length - 1, Math.max(0, delays.length - retries))];
  }
  private async request(platform: Platform, url: URL, method = 'GET', data?: any, retries?: number, tokenOverride?: string): Promise<any> {
    retries ??= this.isRead(url, method) ? 3 : 0;
    const token = tokenOverride ?? await this.token(platform);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (platform === 'google') {
      const dev = process.env.ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN;
      if (!dev) throw new Error('Missing ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN');
      headers['developer-token'] = dev;
      if (process.env.ADS_DIRECT_GOOGLE_LOGIN_CUSTOMER) headers['login-customer-id'] = process.env.ADS_DIRECT_GOOGLE_LOGIN_CUSTOMER;
    }
    let body: string | undefined;
    if (data !== undefined) {
      if (platform === 'meta') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const form = new URLSearchParams();
        for (const [key, value] of Object.entries(data)) if (value !== undefined) form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        body = form.toString();
      } else { headers['Content-Type'] = 'application/json'; body = JSON.stringify(data); }
    }
    let res: Response;
    try { res = await this.fetcher(url, { method, headers, body, signal: AbortSignal.timeout(30000), redirect: 'error' }); }
    catch (error) {
      // Network error or timeout: only a read may be repeated; a write's outcome is unknown and goes to the journal.
      if (retries > 0 && this.isRead(url, method)) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay(retries!, null)));
        return this.request(platform, url, method, data, retries - 1, tokenOverride);
      }
      throw error;
    }
    const text = await res.text();
    let result: any;
    try { result = text ? JSON.parse(text) : {}; } catch { throw new ProviderError(`${platform}: invalid JSON response (${res.status})`, res.status); }
    if (!res.ok || result.error) {
      if (retries > 0 && this.isRead(url, method) && (res.status === 429 || res.status >= 500)) {
        const delay = this.retryDelay(retries, res.headers.get('Retry-After'));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        return this.request(platform, url, method, data, retries - 1, tokenOverride);
      }
      const details = [result.error?.message ?? res.statusText, result.error?.error_user_msg,
        result.error?.error_subcode && `subcode ${result.error.error_subcode}`,
        result.error?.error_data && JSON.stringify(result.error.error_data)].filter(Boolean).join(' | ');
      const message = String(details).split(token).join('[redacted]').slice(0, 1000);
      throw new ProviderError(`${platform} ${res.status}: ${message}`, res.status);
    }
    return result;
  }
  private metaUrl(path: string, params: Record<string, any> = {}) {
    const version = this.options.metaVersion || process.env.META_API_VERSION || 'v26.0';
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Meta API version');
    const url = new URL(`https://graph.facebook.com/${version}/${path}`);
    for (const [k,v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    return url;
  }
  /**
   * Page-scoped endpoints (lead forms, the Page's Instagram accounts) reject a user/system-user token
   * with Meta error #190. Exchange it for that Page's token, which Meta returns only when the token has
   * Page access. Cached in memory for 50 minutes; never written anywhere.
   */
  private async pageToken(pageId: string): Promise<string> {
    const cached = this.pageTokens.get(pageId);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const page = await this.request('meta', this.metaUrl(pageId, { fields: 'access_token' }));
    if (typeof page.access_token !== 'string' || !page.access_token) throw new Error(`The Meta token has no Page access for ${pageId}; give the system user access to this Page`);
    this.pageTokens.set(pageId, { token: page.access_token, expiresAt: Date.now() + 50 * 60_000 });
    return page.access_token;
  }
  async verifyMetaObject(account: string, objectId: string): Promise<void> {
    const object = await this.request('meta', this.metaUrl(objectId, { fields: 'account_id' }));
    if (String(object.account_id) !== account.replace(/^act_/, '')) throw new Error('Object does not belong to the requested ad account');
  }
  async prepareWrite(tool: AdsTool, args: any): Promise<void> {
    if (tool.platform === 'meta') {
      this.metaUrl('');
      for (const key of ['access_token','appsecret_proof','method']) if (key in (args.data ?? {})) throw new Error(`Forbidden provider parameter: ${key}`);
    }
    if (tool.platform === 'google') {
      const version = this.options.googleVersion || process.env.GOOGLE_ADS_API_VERSION || 'v25';
      if (!/^v\d+$/.test(version)) throw new Error('Invalid Google Ads API version');
      if (!process.env.ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN) throw new Error('Missing ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN');
    }
    await this.token(tool.platform);
  }
  async dispatch(tool: AdsTool, args: any): Promise<any> {
    if (tool.action === 'meta_mcp') return this.metaMcpCall(tool, args);
    if (tool.platform === 'meta') return this.meta(tool, args);
    if (tool.platform === 'google') return this.google(tool, args);
    return this.ga4(tool, args);
  }
  private metaMcpClient?: MetaMcpCaller;
  // Reads retry transport failures; writes never do, so a lost response leaves the operation UNCERTAIN, not doubled.
  private async metaMcpCall(tool: AdsTool, args: any): Promise<any> {
    const client = this.metaMcpClient ??= this.options.metaMcp ?? new MetaMcpClient(() => this.token('meta'));
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.callTool(tool.resource!, args.arguments ?? {});
      } catch (error) {
        if (error instanceof MetaMcpToolError) throw new ProviderError(error.message, error.status);
        if (tool.write || attempt >= 2) throw error;
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }
  async close(): Promise<void> { await (this.metaMcpClient as MetaMcpClient | undefined)?.close?.(); }
  async validateGoogleOperations(accountId: string, resource: string, operations: any[]): Promise<any> {
    const tool = { platform: 'google', action: 'mutate', resource } as AdsTool;
    await this.prepareWrite(tool, { accountId });
    return this.google(tool, { accountId, operations, partialFailure: false, validateOnly: true });
  }
  async getGoogleOperation(accountId: string, name: string): Promise<any> {
    if (!name.startsWith(`customers/${accountId}/operations/`)) throw new Error('Operation does not belong to the requested Google Ads account');
    const version = this.options.googleVersion || process.env.GOOGLE_ADS_API_VERSION || 'v25';
    if (!/^v\d+$/.test(version)) throw new Error('Invalid Google Ads API version');
    return this.request('google', new URL(`https://googleads.googleapis.com/${version}/${name}`));
  }
  async launchMetaHierarchy(a: any): Promise<any> {
    a = { ...a, ...a.providerPayload };
    const ids: Record<string, string> = { ...(a.existingIds ?? {}) };
    const create = async (step: string, resource: string, data: any) => {
      const result = await this.meta({ platform: 'meta', action: 'create', resource, parent: 'account' } as AdsTool, { accountId: a.accountId, data });
      if (!/^\d+$/.test(result?.id ?? '')) throw new Error(`${step} response omitted its object ID`);
      ids[step] = result.id;
    };
    try {
      const payloads: Record<string, any> = { campaign: { ...a.campaign, status: 'PAUSED' } };
      if (!ids.campaign) await create('campaign', 'campaigns', payloads.campaign);
      payloads.adset = { ...a.adset, campaign_id: ids.campaign, status: 'PAUSED' };
      if (!ids.adset) await create('adset', 'adsets', payloads.adset);
      payloads.creative = a.creative;
      if (!ids.creative) await create('creative', 'adcreatives', payloads.creative);
      payloads.ad = { ...a.ad, adset_id: ids.adset, creative: { creative_id: ids.creative }, status: 'PAUSED' };
      if (!ids.ad) await create('ad', 'ads', payloads.ad);
      const readbacks: Record<string, any> = {};
      const fields: Record<string, string[]> = {
        campaign: ['id','name','status','effective_status','objective','daily_budget','lifetime_budget','bid_strategy','special_ad_categories','advantage_state_info','issues_info'],
        adset: ['id','name','status','effective_status','campaign_id','optimization_goal','billing_event','targeting','destination_type','promoted_object','attribution_spec','daily_budget','lifetime_budget','issues_info'],
        creative: ['id','name','object_story_id','object_story_spec','instagram_actor_id','url_tags'],
        ad: ['id','name','status','effective_status','adset_id','creative','tracking_specs','issues_info']
      };
      for (const [step, objectId] of Object.entries(ids)) readbacks[step] = await this.meta({ platform: 'meta', action: 'get' } as AdsTool, { objectId, fields: fields[step], params: {} });
      const comparable: Record<string, string[]> = { campaign: ['name','status','objective','daily_budget','lifetime_budget','bid_strategy','special_ad_categories'], adset: ['name','status','campaign_id','optimization_goal','billing_event','targeting','destination_type','promoted_object','attribution_spec','daily_budget','lifetime_budget'], creative: ['name','object_story_id','object_story_spec','instagram_actor_id','url_tags'], ad: ['name','status','adset_id','creative'] };
      const equal = (left: any, right: any) => left && typeof left === 'object' || right && typeof right === 'object' ? JSON.stringify(left) === JSON.stringify(right) : String(left) === String(right);
      for (const [step, keys] of Object.entries(comparable)) for (const key of keys) if (payloads[step][key] !== undefined && !equal(readbacks[step]?.[key], payloads[step][key])) throw new Error(`${step}.${key} readback did not match the approved payload`);
      return { ids, readbacks, delivery: 'PAUSED', remoteVerified: true, configurationVerified: true, policy: { campaign: readbacks.campaign.effective_status ?? 'UNKNOWN', adset: readbacks.adset.effective_status ?? 'UNKNOWN', ad: readbacks.ad.effective_status ?? 'UNKNOWN', issues: [readbacks.campaign.issues_info, readbacks.adset.issues_info, readbacks.ad.issues_info].filter(Boolean) }, advantageState: readbacks.campaign.advantage_state_info ?? null };
    } catch (error) {
      const knownFailure = error instanceof ProviderError && error.status >= 400 && error.status < 500 && error.status !== 408;
      const count = Object.keys(ids).length;
      throw new HierarchyDispatchError(error instanceof Error ? error.message : String(error), { ids, delivery: 'UNKNOWN', remoteVerified: false }, knownFailure && !count ? 'FAILED' : knownFailure || count === 4 ? 'PARTIAL' : 'UNCERTAIN');
    }
  }
  private async meta(tool: AdsTool, a: any): Promise<any> {
    const account = a.accountId ? `act_${a.accountId.replace(/^act_/, '')}` : '';
    let path: string; let params: any = {}; let method = 'GET'; let data: any;
    switch (tool.action) {
      case 'accounts': path = 'me/adaccounts'; params = { fields: 'id,name,currency,timezone_name,account_status,business{id,name}' }; break;
      case 'insights': path = `${a.objectId ?? account}/insights`; params = { level: a.level, fields: a.fields.join(','), time_range: { since: a.since, until: a.until }, breakdowns: a.breakdowns.join(','), time_increment: a.timeIncrement }; break;
      case 'targeting': path = 'search'; params = { ...a.params, type: a.type, q: a.q }; break;
      case 'list': case 'edge': path = `${a.parentId ?? account}/${tool.resource}`; params = { ...a.params, fields: a.fields.join(',') }; break;
      case 'get': path = a.objectId; params = { ...a.params, fields: a.fields.join(',') }; break;
      case 'create': path = `${a.parentId ?? account}/${tool.resource}`; method = 'POST'; data = a.data; break;
      case 'object_post': path = `${a.objectId}/${tool.resource}`; method = 'POST'; data = a.data; break;
      case 'update': path = a.objectId; method = 'POST'; data = a.data; break;
      case 'delete': path = a.objectId; method = 'DELETE'; break;
      default: throw new Error(`Unsupported Meta operation ${tool.action}`);
    }
    // Auth and request method may never be overridden through provider payloads.
    for (const key of ['access_token','appsecret_proof','method']) if (key in params || (data && key in data)) throw new Error(`Forbidden provider parameter: ${key}`);
    const url = this.metaUrl(path, params);
    const pageToken = tool.parent === 'page' && a.parentId ? await this.pageToken(String(a.parentId)) : undefined;
    const first = await this.request('meta', url, method, data, undefined, pageToken);
    if (method !== 'GET' || !Array.isArray(first.data)) return first;
    const rows = [...first.data]; let page = first; const seen = new Set<string>();
    while (page.paging?.next) {
      const cursor = page.paging.cursors?.after;
      if (!cursor || seen.has(cursor)) throw new Error('Meta pagination did not advance');
      if (seen.size >= 1000) throw new Error('Report exceeds 1000 pages; request a smaller interval');
      seen.add(cursor); url.searchParams.set('after', cursor);
      page = await this.request('meta', url, 'GET', undefined, undefined, pageToken); rows.push(...(page.data ?? []));
    }
    return { ...first, data: rows, paging: undefined };
  }
  private async google(tool: AdsTool, a: any): Promise<any> {
    const version = this.options.googleVersion || process.env.GOOGLE_ADS_API_VERSION || 'v25';
    if (!/^v\d+$/.test(version)) throw new Error('Invalid Google Ads API version');
    const base = `https://googleads.googleapis.com/${version}`;
    if (tool.action === 'accounts') return this.request('google', new URL(`${base}/customers:listAccessibleCustomers`));
    const customer = a.accountId;
    const endpoint = tool.action === 'search' ? 'googleAds:search' : tool.action === 'mutate' ? `${tool.resource}:mutate` : tool.action === 'resource_action' ? `${tool.resource}/${a.objectId}:${tool.parent}` : tool.action;
    const customerAction = ['generateKeywordIdeas','generateKeywordHistoricalMetrics','generateKeywordForecastMetrics','uploadClickConversions','uploadConversionAdjustments'].includes(tool.action);
    const url = new URL(`${base}/customers/${customer}${customerAction ? ':' : '/'}${endpoint}`);
    const body = tool.action === 'search' ? { query: a.query } : tool.action === 'mutate' ? { operations: a.operations, partialFailure: a.partialFailure, validateOnly: a.validateOnly } : a.data;
    const result = await this.request('google', url, 'POST', body);
    if (tool.action !== 'search') return result;
    const rows = [...(result.results ?? [])]; let token = result.nextPageToken; const seen = new Set<string>();
    while (token) {
      if (seen.has(token) || seen.size >= 1000) throw new Error('Google pagination limit/repeated cursor');
      seen.add(token);
      const page = await this.request('google', url, 'POST', { ...body, pageToken: token });
      rows.push(...(page.results ?? [])); token = page.nextPageToken;
    }
    return { ...result, results: rows, nextPageToken: undefined };
  }
  private async ga4(tool: AdsTool, a: any): Promise<any> {
    const property = `properties/${a.accountId}`;
    if (tool.action.startsWith('admin_') || tool.action.startsWith('settings_')) {
      const action = tool.action.split('_')[1];
      const path = `${property}/${a.streamId ? 'dataStreams/' + a.streamId + '/' : ''}${tool.resource}${a.objectId ? '/' + a.objectId : ''}`;
      const url = new URL(`https://analyticsadmin.googleapis.com/v1alpha/${path}`);
      if (a.updateMask) url.searchParams.set('updateMask', a.updateMask);
      const method = action === 'create' ? 'POST' : action === 'update' ? 'PATCH' : action === 'delete' ? 'DELETE' : 'GET';
      const first = await this.request('ga4', url, method, a.data);
      if (action !== 'list') return first;
      const rows = [...(first[tool.resource!] ?? [])]; let token = first.nextPageToken; const seen = new Set<string>();
      while (token) {
        if (seen.has(token) || seen.size >= 1000) throw new Error('GA4 Admin pagination did not advance');
        seen.add(token); url.searchParams.set('pageToken', token);
        const page = await this.request('ga4', url); rows.push(...(page[tool.resource!] ?? [])); token = page.nextPageToken;
      }
      return { ...first, [tool.resource!]: rows, nextPageToken: undefined };
    }
    const dataVersion = tool.action === 'runFunnelReport' ? 'v1alpha' : 'v1beta';
    const url = new URL(`https://analyticsdata.googleapis.com/${dataVersion}/${property}${tool.action === 'metadata' ? '/metadata' : ':' + tool.action}`);
    const reportData = ['runPivotReport','runFunnelReport'].includes(tool.action)
      ? { ...a.data, returnPropertyQuota: true }
      : ['runReport','runRealtimeReport'].includes(tool.action) ? { ...a.data, limit: Math.min(Number(a.data.limit ?? 250000), 250000), returnPropertyQuota: true } : a.data;
    const first = await this.request('ga4', url, tool.action === 'metadata' ? 'GET' : 'POST', reportData, 2);
    if (tool.action !== 'runReport') return first;
    const rows = [...(first.rows ?? [])]; const initial = Number(a.data.offset ?? 0);
    while (initial + rows.length < Number(first.rowCount ?? 0)) {
      if (!rows.length || rows.length > 1000000) throw new Error('Report too large or pagination stalled; narrow the date range');
      const page = await this.request('ga4', url, 'POST', { ...reportData, offset: String(initial + rows.length) }, 2);
      if (!page.rows?.length) throw new Error('GA4 pagination returned an empty page before rowCount');
      rows.push(...page.rows);
    }
    return { ...first, rows };
  }
}
