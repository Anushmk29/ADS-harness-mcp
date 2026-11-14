import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { dataDir } from '../config/paths.js';
import { BusinessConfigSchema } from '../config/config-loader.js';
import { AdsTransport } from '../modules/ads/transport.js';

export type CheckLevel = 'ok' | 'warn' | 'fail';
export interface Check { name: string; level: CheckLevel; detail: string }
export interface DoctorOptions { live?: boolean; fetch?: typeof fetch; now?: number; configDir?: string }

const EXPIRY_WARN_DAYS = 7;
const MIN_FREE_BYTES = 1024 ** 3;

/** Green/red checklist for one client deployment. `live` adds one cheap read per connected provider. */
export async function runDoctor(options: DoctorOptions = {}): Promise<Check[]> {
  const env = process.env, f = options.fetch ?? fetch, now = options.now ?? Date.now();
  const configDir = options.configDir ?? path.join(process.cwd(), 'config');
  const checks: Check[] = [];
  const add = (name: string, level: CheckLevel, detail: string) => checks.push({ name, level, detail });
  const probe = async (name: string, fn: () => Promise<string>) => {
    try { add(name, 'ok', await fn()); } catch (e: any) { add(name, 'fail', e.message); }
  };
  const getJson = async (url: string, init?: RequestInit) => {
    const res = await f(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<any>;
  };

  // Storage
  const dir = dataDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    const s = fs.statfsSync(dir), free = s.bavail * s.bsize;
    add('data dir', free < MIN_FREE_BYTES ? 'warn' : 'ok', `${dir} writable, ${(free / 1024 ** 3).toFixed(1)} GB free`);
  } catch (e: any) { add('data dir', 'fail', `${dir}: ${e.message}`); }

  // Config
  try {
    BusinessConfigSchema.parse(YAML.parse(fs.readFileSync(path.join(configDir, 'business.yaml'), 'utf8')));
    add('business.yaml', 'ok', 'valid');
  } catch (e: any) { add('business.yaml', 'fail', e.message.slice(0, 300)); }
  if (env.NODE_ENV === 'production' && !env.HARNESS_KEY) add('HARNESS_KEY', 'fail', 'required in production (ops access + remote protection)');
  // Alerts: without Telegram, dead jobs / expiring tokens / LLM outages only reach the logs.
  if (!env.ALERT_TELEGRAM_BOT_TOKEN || !env.ALERT_TELEGRAM_CHAT_ID) add('alerts', env.NODE_ENV === 'production' ? 'fail' : 'warn', 'set ALERT_TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID so problems reach you');
  else if (options.live) await probe('alerts', async () => {
    const { result } = await getJson(`https://api.telegram.org/bot${env.ALERT_TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(env.ALERT_TELEGRAM_CHAT_ID!)}`);
    return `Telegram bot can reach ${result?.title ?? result?.username ?? result?.first_name ?? 'the chat'}`;
  });
  if (!env.MARKETING_TOKEN_KEY) add('MARKETING_TOKEN_KEY', 'warn', 'unset; stored OAuth tokens cannot be encrypted');

  // LLM: at least one provider
  const keyed = [['DEEPSEEK_API_KEY', 'deepseek', 'DEEPSEEK_MODEL'], ['OPENROUTER_API_KEY', 'openrouter', 'OPENROUTER_TEXT_MODEL']].filter(([key]) => env[key]);
  for (const [key, name, model] of keyed) if (!env[model]) add(`llm:${name}`, 'warn', `${key} set but ${model} unset; provider unused`);
  const llm = keyed.filter(([, , model]) => env[model]);
  if (!llm.length) add('llm', 'fail', 'no usable LLM (DEEPSEEK_API_KEY+DEEPSEEK_MODEL or OPENROUTER_API_KEY+OPENROUTER_TEXT_MODEL)');
  if (options.live) for (const [key, name] of llm) await probe(`llm:${name}`, async () => {
    if (name === 'deepseek') { await getJson('https://api.deepseek.com/models', { headers: { authorization: `Bearer ${env[key]}` } }); return 'key accepted'; }
    const { data } = await getJson('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${env[key]}` } });
    return data?.limit_remaining != null ? `$${Number(data.limit_remaining).toFixed(2)} credit left` : 'key accepted';
  });

  // Ads: platforms with configured accounts need credentials
  let adsPolicy: any = {};
  try { adsPolicy = YAML.parse(fs.readFileSync(env.ADS_POLICY_FILE || path.join(configDir, 'ads-module.yaml'), 'utf8')) ?? {}; } catch { /* ads not configured */ }
  const accounts: Record<string, string[]> = adsPolicy.accounts ?? {};
  const transport = new AdsTransport({ fetch: f });
  const hasGoogleRefresh = (p: string) => Boolean((env[`ADS_DIRECT_${p}_REFRESH_TOKEN`] ?? env.GOOGLE_REFRESH_TOKEN) && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  if (accounts.meta?.length) {
    if (!env.ADS_DIRECT_META_ACCESS_TOKEN) add('meta', 'fail', 'accounts configured but ADS_DIRECT_META_ACCESS_TOKEN unset');
    else if (options.live) await probe('meta', async () => {
      const token = env.ADS_DIRECT_META_ACCESS_TOKEN!, v = env.META_API_VERSION || 'v26.0';
      const { data } = await getJson(`https://graph.facebook.com/${v}/debug_token?input_token=${token}&access_token=${token}`);
      if (data?.is_valid === false) throw new Error('token invalid; issue a new long-lived token');
      const expires = Number(data?.expires_at ?? 0) * 1000;
      if (!expires) return 'token valid, no expiry';
      const days = Math.floor((expires - now) / 86400000);
      if (days <= EXPIRY_WARN_DAYS) throw new Error(`token expires in ${days} day(s); renew it now`);
      return `token valid, expires in ${days} days`;
    });
  }
  if (accounts.google?.length) {
    if (!env.ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN || !(env.ADS_DIRECT_GOOGLE_ACCESS_TOKEN || hasGoogleRefresh('GOOGLE'))) add('google', 'fail', 'needs ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN and an access or refresh token');
    else if (options.live) await probe('google', async () => {
      const { resourceNames } = await getJson(`https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION || 'v25'}/customers:listAccessibleCustomers`,
        { headers: { authorization: `Bearer ${await transport.token('google')}`, 'developer-token': env.ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN! } });
      return `${resourceNames?.length ?? 0} accessible customer(s)`;
    });
  }
  const ga4Property = accounts.ga4?.[0] ?? env.ADS_DIRECT_GA4_PROPERTY_ID;
  if (accounts.ga4?.length) {
    if (!(env.ADS_DIRECT_GA4_ACCESS_TOKEN || hasGoogleRefresh('GA4'))) add('ga4', 'fail', 'needs ADS_DIRECT_GA4_ACCESS_TOKEN or a GA4 refresh token');
    else if (options.live) await probe('ga4', async () => {
      await getJson(`https://analyticsdata.googleapis.com/v1beta/properties/${ga4Property}/metadata`, { headers: { authorization: `Bearer ${await transport.token('ga4')}` } });
      return `property ${ga4Property} readable`;
    });
  }
  await transport.close().catch(() => {});
  return checks;
}

export function formatChecks(checks: Check[]): string {
  const icon = { ok: '[ok]  ', warn: '[warn]', fail: '[FAIL]' };
  return checks.map(c => `${icon[c.level]} ${c.name.padEnd(20)} ${c.detail}`).join('\n');
}
