import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actorInput, DecodeService, normalize, normalizeOwnMeta, type DecodeEvent } from '../../src/modules/decode/index.js';
import { timestamped } from '../../src/modules/decode/transcribe.js';

const start = Math.floor(Date.now() / 1000) - 10 * 86400;
const library = [
  { ad_archive_id: 'a', page_name: 'amy', start_date: start, collation_count: 9, snapshot: { body: { text: 'Day 3 of copying millionaires' }, videos: [{ video_sd_url: 'https://cdn/a.mp4' }] } },
  { ad_archive_id: 'a', page_name: 'amy', start_date: start, snapshot: { body: { text: 'duplicate' } } },
  { ad_archive_id: 'img', page_name: 'x', start_date: start, snapshot: {} },
  { ad_archive_id: 'b', page_name: 'bo', start_date: start, collation_count: 2, snapshot: { title: '3 websites they are gatekeeping' } }
];

describe('decode normalizers', () => {
  it('reads Ad Library shapes, keeping unique ads that have copy', () => {
    expect(normalize('meta_ads', library).map(i => [i.id, i.y, i.handle])).toEqual([['a', 9, 'amy'], ['b', 2, 'bo']]);
    const now = Date.UTC(2026, 9, 1);
    const ad = normalize('meta_ads', [{ ad_archive_id: '77', page_name: 'Rival', start_date: now / 1000 - 30 * 86400, is_active: true, collation_count: 4, snapshot: { title: 'Stop losing leads', body: { text: 'Every missed call' }, cta_text: 'Book now' } }], now)[0];
    expect(ad).toMatchObject({ id: '77', handle: 'Rival', x: 30, y: 4, url: 'https://www.facebook.com/ads/library/?id=77' });
    expect(ad.text).toContain('CTA: Book now');
  });

  it('builds Ad Library actor input from a keyword or URL', () => {
    expect((actorInput('meta_ads', 'ai receptionist', 10) as any).urls[0].url).toContain('q=ai%20receptionist');
    expect((actorInput('meta_ads', 'https://www.facebook.com/ads/library/?id=1', 10) as any).urls[0].url).toBe('https://www.facebook.com/ads/library/?id=1');
  });

  it('plots our own Meta ads by spend against the metric the account actually measures', () => {
    const ads = [{ id: '1', name: 'Missed calls UGC', created_time: '2026-09-01', creative: { title: 'Stop losing leads', body: 'Every missed call is a lost patient', thumbnail_url: 'https://t/1.jpg' } }];
    const leadRows = [
      { ad_id: '1', ad_name: 'Missed calls UGC', spend: '1200', impressions: '40000', clicks: '600', ctr: '1.5', actions: [{ action_type: 'lead', value: '12' }, { action_type: 'onsite_conversion.lead_grouped', value: '12' }] },
      { ad_id: '2', ad_name: 'Unspent', spend: '0' }
    ];
    const leads = normalizeOwnMeta('act_99', ads, leadRows);
    expect(leads.axes).toEqual({ x: 'spend', y: 'leads' });
    expect(leads.items).toHaveLength(1);
    expect(leads.items[0]).toMatchObject({ x: 1200, y: 12, thumb: 'https://t/1.jpg', text: 'Stop losing leads\nEvery missed call is a lost patient' });
    expect(leads.items[0].url).toContain('act=99&selected_ad_ids=1');
    const sales = normalizeOwnMeta('99', [], [{ ad_id: '3', spend: '100', action_values: [{ action_type: 'omni_purchase', value: '350' }, { action_type: 'purchase', value: '350' }] }]);
    expect(sales.axes.y).toBe('ROAS');
    expect(sales.items[0]).toMatchObject({ y: 3.5, stats: { revenue: 350, roas: 3.5 } });
    expect(normalizeOwnMeta('99', [], [{ ad_id: '4', spend: '50', ctr: '0.8' }]).axes.y).toBe('CTR %');
  });

  it('formats transcripts with m:ss markers', () => {
    expect(timestamped({ text: '', segments: [{ start: 4.2, text: 'Look at this' }, { start: 75, text: 'Comment TRADE' }] })).toBe('[0:04] Look at this\n[1:15] Comment TRADE');
  });
});

describe('DecodeService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('scrapes, transcribes, classifies, streams every item and persists the run', async () => {
    Object.assign(process.env, { APIFY_TOKEN: 't', DEEPSEEK_API_KEY: 'k', DEEPSEEK_MODEL: 'm' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decode-'));
    let classifyBody = '';
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://api.apify.com')) return new Response(JSON.stringify(library));
      classifyBody = String(init?.body);
      return new Response(JSON.stringify({
        usage: { prompt_tokens: 1_000_000, completion_tokens: 0 },
        choices: [{ message: { content: JSON.stringify({
          newFormats: [{ name: 'day (n) of copying millionaires', description: 'serial challenge' }],
          items: [{ i: 0, format: 'day (n) of copying millionaires', hook: 'Day 3', beats: [{ tag: 'hook', text: 'Day 3', t: 0 }] }, { i: 1, format: 'gatekept websites', hook: '3 websites' }]
        }) } }]
      }));
    }) as unknown as typeof fetch;
    const events: DecodeEvent[] = [];
    const transcriber = { name: 'fake', transcribe: vi.fn(async (files: string[]) => ({ results: files.map(() => ({ text: 'Day 3 of this', segments: [{ start: 0, text: 'Day 3 of this' }] })), costUsd: 0.01 })) };
    const extractAudio = vi.fn(async () => true);
    const service = new DecodeService(dir, e => events.push(e), { fetchImpl: fakeFetch, transcriber, extractAudio });

    const run = service.start({ mode: 'ads', query: 'rival', limit: 10 });
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ type: 'run', run: { status: 'done' } }));

    const items = events.filter(e => e.type === 'item');
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ decoded: 2, transcribed: 1 });
    expect((items[1] as any).costUsd).toBeCloseTo(0.29);
    // Only the ad with a video URL is transcribed, and the classifier sees what was said.
    expect(extractAudio).toHaveBeenCalledTimes(1);
    expect(extractAudio.mock.calls[0][0]).toBe('https://cdn/a.mp4');
    expect(JSON.parse(JSON.parse(classifyBody).messages[1].content).items[0].spoken).toBe('[0:00] Day 3 of this');
    const saved = service.get(run.id)!;
    expect(saved.formats.map(f => f.name)).toEqual(['day (n) of copying millionaires', 'gatekept websites']);
    expect(saved.items[0]).toMatchObject({ format: 'day (n) of copying millionaires', hook: 'Day 3', transcript: '[0:00] Day 3 of this', beats: [{ t: 0 }] });
    expect(saved.items[1].transcript).toBeUndefined();
    expect(service.list()[0]).toMatchObject({ id: run.id, total: 2, status: 'done' });
  });

  it('decodes our own ads through the ads read path, without transcription', async () => {
    Object.assign(process.env, { DEEPSEEK_API_KEY: 'k', DEEPSEEK_MODEL: 'm' });
    delete process.env.APIFY_TOKEN;
    const runAds = vi.fn(async (capability: string) => capability === 'meta_ads_list_ad'
      ? { data: [{ id: '1', name: 'UGC', creative: { body: 'Never miss a call' } }] }
      : { data: [{ ad_id: '1', ad_name: 'UGC', spend: '500', actions: [{ action_type: 'lead', value: '5' }] }] });
    const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ i: 0, format: 'pain hook', hook: 'Never miss a call' }] }) } }] }))) as unknown as typeof fetch;
    const events: DecodeEvent[] = [];
    const transcriber = { name: 'fake', transcribe: vi.fn() };
    const service = new DecodeService(fs.mkdtempSync(path.join(os.tmpdir(), 'decode-')), e => events.push(e), { fetchImpl: fakeFetch, runAds, transcriber });

    const run = service.start({ mode: 'ads', platform: 'own_meta', query: 'act_42', days: 7 });
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ type: 'run', run: { status: 'done' } }));
    expect(run.transcriber).toBeUndefined();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(runAds).toHaveBeenCalledWith('meta_ads_insights', expect.objectContaining({ accountId: 'act_42', level: 'ad', timeIncrement: 'all_days' }));
    expect(service.get(run.id)).toMatchObject({ axes: { x: 'spend', y: 'leads' }, items: [{ x: 500, y: 5, format: 'pain hook' }] });
    expect(() => service.start({ mode: 'ads', platform: 'own_meta', query: 'not-an-account' })).toThrow('ad account id');
  });

  it('refuses to start without keys', () => {
    delete process.env.APIFY_TOKEN;
    const service = new DecodeService(fs.mkdtempSync(path.join(os.tmpdir(), 'decode-')), () => {});
    expect(() => service.start({ mode: 'ads', query: 'rival' })).toThrow('APIFY_TOKEN');
  });
});
