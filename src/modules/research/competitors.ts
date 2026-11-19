import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../../config/paths.js';
import { chat as defaultChat, type ChatRequest, type ChatResult } from '../../core/llm/index.js';

/**
 * Real competitor ads from the Meta Ad Library, fetched through Apify (COMPETITOR_API_KEY).
 * Code computes the patterns (longest-running ads, formats, CTAs, offers); a model may only *name* angles,
 * and every angle must cite ad IDs that exist in the data. No key = a clear error, never sample data.
 */
export interface Competitor { name: string; query?: string; pageId?: string; country?: string }
export interface CompetitorAd {
  id: string; page: string; text: string; title?: string; cta?: string; link?: string; format: string;
  startDate: string | null; endDate: string | null; active: boolean; daysRunning: number | null; platforms: string[];
}

const DAY = 86_400_000;
// ponytail: field names follow apify/facebook-ads-scraper output (camelCase, with snake_case fallbacks); verify against a live run.
const pick = (o: any, ...keys: string[]) => { for (const k of keys) { const v = k.split('.').reduce((x, p) => x?.[p], o); if (v !== undefined && v !== null && v !== '') return v; } return undefined; };
const toDate = (v: unknown): string | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v), d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export function normalizeAd(raw: any, now = Date.now()): CompetitorAd | null {
  const id = pick(raw, 'adArchiveID', 'adArchiveId', 'ad_archive_id', 'adid', 'id');
  if (!id) return null;
  const s = raw.snapshot ?? {};
  const text = String(pick(s, 'body.text', 'body.markup.__html', 'body') ?? pick(s, 'cards.0.body') ?? '').replace(/<[^>]+>/g, '').trim();
  const startDate = toDate(pick(raw, 'startDate', 'start_date', 'startDateFormatted')), endDate = toDate(pick(raw, 'endDate', 'end_date', 'endDateFormatted'));
  const active = Boolean(pick(raw, 'isActive', 'is_active') ?? !endDate);
  const end = active || !endDate ? now : Date.parse(endDate);
  return {
    id: String(id), page: String(pick(raw, 'pageName', 'page_name', 'snapshot.pageName', 'snapshot.page_name') ?? ''), text,
    title: pick(s, 'title', 'cards.0.title'), cta: pick(s, 'ctaText', 'cta_text'), link: pick(s, 'linkUrl', 'link_url', 'cards.0.linkUrl', 'cards.0.link_url'),
    format: String(pick(s, 'displayFormat', 'display_format') ?? (s.videos?.length ? 'VIDEO' : s.cards?.length > 1 ? 'CAROUSEL' : 'IMAGE')).toUpperCase(),
    startDate, endDate, active, daysRunning: startDate ? Math.max(0, Math.floor((end - Date.parse(startDate)) / DAY)) : null,
    platforms: (pick(raw, 'publisherPlatform', 'publisher_platform') ?? []) as string[]
  };
}

export function adLibraryUrl(c: Competitor): string {
  const p = new URLSearchParams({ active_status: 'all', ad_type: 'all', country: c.country ?? 'ALL', media_type: 'all' });
  if (c.pageId) { p.set('search_type', 'page'); p.set('view_all_page_id', c.pageId); }
  else { p.set('search_type', 'keyword_unordered'); p.set('q', c.query ?? c.name); }
  return `https://www.facebook.com/ads/library/?${p}`;
}

export async function fetchCompetitorAds(c: Competitor, options: { limit?: number; fetch?: typeof fetch; env?: NodeJS.ProcessEnv; now?: number } = {}): Promise<CompetitorAd[]> {
  const env = options.env ?? process.env, token = env.COMPETITOR_API_KEY;
  if (!token) throw new Error('Competitor research needs COMPETITOR_API_KEY (an Apify API token); no sample data is used');
  const actor = env.COMPETITOR_APIFY_ACTOR || 'apify~facebook-ads-scraper';
  const res = await (options.fetch ?? fetch)(`https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?timeout=240`, {
    method: 'POST', signal: AbortSignal.timeout(300_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUrls: [{ url: adLibraryUrl(c) }], resultsLimit: options.limit ?? 50, activeStatus: '' })
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Apify returned no dataset items');
  return items.map(i => normalizeAd(i, options.now)).filter((a): a is CompetitorAd => a !== null);
}

const OFFERS: Array<[string, RegExp]> = [
  ['percent off', /\b\d{1,2}\s?%\s?off\b/i], ['free shipping/delivery', /\bfree (shipping|delivery)\b/i], ['free trial/demo', /\bfree (trial|demo|consultation|audit)\b/i],
  ['sale/discount', /\b(sale|discount|deal|offer)\b/i], ['price shown', /(₹|rs\.?|\$|€|£)\s?\d/i], ['limited time', /\b(limited time|today only|ends (soon|tonight)|last chance)\b/i],
  ['guarantee', /\b(guarantee|money.?back|refund)\b/i], ['bundle/gift', /\b(bundle|combo|free gift|buy \d+ get)\b/i]
];
const count = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((m, v) => (m[v] = (m[v] ?? 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, ads: n }));

/** Patterns computed from the ads alone. Ads that keep running for weeks are the ones paying for themselves. */
export function analyzeCompetitorAds(ads: CompetitorAd[]) {
  const longest = ads.filter(a => a.daysRunning !== null).sort((a, b) => b.daysRunning! - a.daysRunning!).slice(0, 5)
    .map(a => ({ id: a.id, page: a.page, daysRunning: a.daysRunning, active: a.active, format: a.format, text: a.text.slice(0, 220), cta: a.cta, link: a.link }));
  const domains = ads.map(a => { try { return a.link ? new URL(a.link).hostname.replace(/^www\./, '') : ''; } catch { return ''; } }).filter(Boolean);
  return {
    total: ads.length, active: ads.filter(a => a.active).length,
    runningOver30Days: ads.filter(a => (a.daysRunning ?? 0) >= 30).length,
    longestRunning: longest,
    formats: count(ads.map(a => a.format)),
    ctas: count(ads.map(a => a.cta).filter((c): c is string => Boolean(c))),
    offers: OFFERS.map(([name, re]) => ({ value: name, ads: ads.filter(a => re.test(`${a.title ?? ''} ${a.text}`)).length })).filter(o => o.ads > 0).sort((a, b) => b.ads - a.ads),
    landingDomains: count(domains).slice(0, 5)
  };
}

type Chat = (request: ChatRequest) => Promise<ChatResult>;

/** Model groups ads into angles; any angle citing an unknown ad ID is dropped. Null when no model is available. */
export async function nameAngles(ads: CompetitorAd[], options: { chat?: Chat } = {}) {
  if (!ads.length) return null;
  const known = new Set(ads.map(a => a.id));
  try {
    const result = await (options.chat ?? defaultChat)({ purpose: 'competitor-angles', json: true, timeoutMs: 60_000, messages: [
      { role: 'system', content: 'Group these competitor ads by the selling angle they use (e.g. price, speed, social proof, fear of missing out). Use only what the ad text says. Return JSON {"angles":[{"angle":"short name","description":"one sentence","adIds":["ids of the ads that use it"]}]} with at most 6 angles. Every angle must list adIds copied exactly from the input.' },
      { role: 'user', content: JSON.stringify(ads.slice(0, 60).map(a => ({ id: a.id, page: a.page, text: a.text.slice(0, 400), title: a.title, cta: a.cta, daysRunning: a.daysRunning }))) }
    ] });
    const parsed = JSON.parse(String(result.message?.content ?? '{}'));
    const angles = (Array.isArray(parsed.angles) ? parsed.angles : []).map((a: any) => ({ angle: String(a.angle ?? '').slice(0, 80), description: String(a.description ?? '').slice(0, 300), adIds: (Array.isArray(a.adIds) ? a.adIds : []).map(String).filter((id: string) => known.has(id)) }))
      .filter((a: any) => a.angle && a.adIds.length);
    return { angles, model: `${result.provider}/${result.model}` };
  } catch { return null; }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'competitor';

/** Save today's snapshot; return the ads not present in the previous snapshot ("new this week"). */
export function snapshotAndDiff(c: Competitor, ads: CompetitorAd[], now = Date.now(), root = dataDir('research')) {
  const dir = join(root, 'competitors', slug(c.name));
  mkdirSync(dir, { recursive: true });
  const today = new Date(now).toISOString().slice(0, 10);
  const previous = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${today}.json`).sort().pop();
  const prevIds = previous ? new Set<string>(JSON.parse(readFileSync(join(dir, previous), 'utf8')).ads.map((a: CompetitorAd) => a.id)) : null;
  writeFileSync(join(dir, `${today}.json`), JSON.stringify({ competitor: c, fetchedAt: new Date(now).toISOString(), ads }));
  return { previousSnapshot: previous?.slice(0, 10) ?? null, newAds: prevIds ? ads.filter(a => !prevIds.has(a.id)) : null };
}

/** Full research run for one competitor: fetch, patterns, diff, angles. Labelled with source and date. */
export async function researchCompetitor(c: Competitor, options: { limit?: number; fetch?: typeof fetch; chat?: Chat; now?: number; root?: string; angles?: boolean } = {}) {
  const now = options.now ?? Date.now();
  const ads = await fetchCompetitorAds(c, { limit: options.limit, fetch: options.fetch, now });
  const { previousSnapshot, newAds } = snapshotAndDiff(c, ads, now, options.root);
  return {
    competitor: c, source: 'Meta Ad Library via Apify', libraryUrl: adLibraryUrl(c), fetchedAt: new Date(now).toISOString(),
    patterns: analyzeCompetitorAds(ads),
    newSinceLastSnapshot: newAds === null ? null : { since: previousSnapshot, count: newAds.length, ads: newAds.slice(0, 10).map(a => ({ id: a.id, text: a.text.slice(0, 220), format: a.format, startDate: a.startDate })) },
    angles: options.angles === false ? null : await nameAngles(ads, { chat: options.chat })
  };
}
