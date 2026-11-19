import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adLibraryUrl, analyzeCompetitorAds, fetchCompetitorAds, nameAngles, normalizeAd, researchCompetitor } from '../../src/modules/research/competitors.js';
import { createDepartment } from '../../src/departments/runtime.js';

const now = Date.UTC(2026, 10, 19);
const sec = (iso: string) => Date.parse(iso) / 1000;
// Shapes as returned by apify/facebook-ads-scraper (camelCase) plus one snake_case item.
const items = [
  { adArchiveID: '111', pageName: 'Acme', isActive: true, startDate: sec('2026-09-01'), publisherPlatform: ['FACEBOOK', 'INSTAGRAM'],
    snapshot: { body: { text: 'Flat 30% off all running shoes. Free delivery across India.' }, title: 'Acme Run', ctaText: 'Shop now', linkUrl: 'https://www.acme.in/run?utm=x', displayFormat: 'VIDEO' } },
  { adArchiveID: '222', pageName: 'Acme', isActive: false, startDate: sec('2026-10-01'), endDate: sec('2026-10-11'),
    snapshot: { body: { text: 'New colours just dropped. ₹1,999 only.' }, ctaText: 'Shop now', linkUrl: 'https://acme.in/new', displayFormat: 'IMAGE' } },
  { ad_archive_id: '333', page_name: 'Acme', is_active: true, start_date: sec('2026-11-15'), snapshot: { body: { markup: { __html: '<b>30-day money-back guarantee</b>' } }, cta_text: 'Learn more', cards: [{}, {}] } },
  { snapshot: { body: { text: 'no id: dropped' } } }
];
const apify = (body: unknown = items, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('competitor ads', () => {
  it('normalises Apify items from both field styles and drops items without an id', () => {
    const ads = items.map(i => normalizeAd(i, now)).filter(Boolean);
    expect(ads).toHaveLength(3);
    expect(ads[0]).toMatchObject({ id: '111', page: 'Acme', format: 'VIDEO', cta: 'Shop now', startDate: '2026-09-01', active: true, daysRunning: 79, platforms: ['FACEBOOK', 'INSTAGRAM'] });
    expect(ads[1]).toMatchObject({ id: '222', active: false, endDate: '2026-10-11', daysRunning: 10 });
    expect(ads[2]).toMatchObject({ id: '333', text: '30-day money-back guarantee', format: 'CAROUSEL', cta: 'Learn more' });
  });

  it('computes patterns in code: longest running, formats, CTAs, offers, domains', () => {
    const p = analyzeCompetitorAds(items.map(i => normalizeAd(i, now)!).filter(Boolean));
    expect(p).toMatchObject({ total: 3, active: 2, runningOver30Days: 1 });
    expect(p.longestRunning[0]).toMatchObject({ id: '111', daysRunning: 79 });
    expect(p.ctas[0]).toEqual({ value: 'Shop now', ads: 2 });
    expect(p.offers.map(o => o.value)).toEqual(expect.arrayContaining(['percent off', 'free shipping/delivery', 'price shown', 'guarantee']));
    expect(p.landingDomains[0]).toEqual({ value: 'acme.in', ads: 2 });
  });

  it('refuses to run without a key and never returns sample data', async () => {
    const network = apify();
    await expect(fetchCompetitorAds({ name: 'Acme' }, { env: {}, fetch: network })).rejects.toThrow('COMPETITOR_API_KEY');
    expect(network).not.toHaveBeenCalled();
    await expect(fetchCompetitorAds({ name: 'Acme' }, { env: { COMPETITOR_API_KEY: 'k' }, fetch: apify({ error: 'x' }, 402) })).rejects.toThrow('Apify 402');
  });

  it('calls the Apify actor with a bearer token and the Ad Library URL', async () => {
    const network = apify();
    await fetchCompetitorAds({ name: 'Acme', pageId: '987', country: 'IN' }, { env: { COMPETITOR_API_KEY: 'secret' }, fetch: network, limit: 20 });
    const [url, init] = network.mock.calls[0] as any;
    expect(String(url)).toContain('/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items');
    expect(String(url)).not.toContain('secret');
    expect(init.headers.Authorization).toBe('Bearer secret');
    const body = JSON.parse(init.body);
    expect(body.resultsLimit).toBe(20);
    expect(body.startUrls[0].url).toBe(adLibraryUrl({ name: 'Acme', pageId: '987', country: 'IN' }));
    expect(body.startUrls[0].url).toContain('view_all_page_id=987');
  });

  it('keeps only model angles that cite real ad ids', async () => {
    const ads = items.map(i => normalizeAd(i, now)!).filter(Boolean);
    const chat = vi.fn(async () => ({ provider: 'deepseek', model: 'm', costUsd: 0, message: { content: JSON.stringify({ angles: [
      { angle: 'Discounts', description: 'Price-led.', adIds: ['111', '222', '999'] },
      { angle: 'Invented', description: 'No real ads.', adIds: ['999'] }
    ] }) } }));
    const out = await nameAngles(ads, { chat });
    expect(out!.angles).toEqual([{ angle: 'Discounts', description: 'Price-led.', adIds: ['111', '222'] }]);
    expect(await nameAngles(ads, { chat: vi.fn(async () => { throw new Error('down'); }) })).toBeNull();
  });

  it('snapshots each run and reports ads that are new since the last one', async () => {
    vi.stubEnv('COMPETITOR_API_KEY', 'k');
    try {
      const root = mkdtempSync(join(tmpdir(), 'competitors-'));
      const first = await researchCompetitor({ name: 'Acme Shoes' }, { fetch: apify(items.slice(0, 2)), now: now - 7 * 86_400_000, root, angles: false });
      expect(first.newSinceLastSnapshot).toBeNull();
      const second = await researchCompetitor({ name: 'Acme Shoes' }, { fetch: apify(items), now, root, angles: false });
      expect(second).toMatchObject({ source: 'Meta Ad Library via Apify', newSinceLastSnapshot: { since: '2026-11-12', count: 1, ads: [{ id: '333' }] } });
      expect(readdirSync(join(root, 'competitors', 'acme-shoes'))).toEqual(['2026-11-12.json', '2026-11-19.json']);
    } finally { vi.unstubAllEnvs(); }
  });

  it('is a live research capability (no template skills left) and validates its input', async () => {
    const research = createDepartment('research', { storageDir: mkdtempSync(join(tmpdir(), 'research-')) });
    try {
      expect(research.listCapabilities().map(c => c.name)).toEqual(expect.arrayContaining(['skill_competitor_ads', 'skill_knowledge']));
      expect(research.listCapabilities().map(c => c.name)).not.toContain('skill_market_research');
      await expect(research.run({ capability: 'skill_competitor_ads', input: { name: 'Acme', country: 'india' } })).rejects.toThrow();
    } finally { await research.close(); }
  });
});
