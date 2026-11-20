import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdsService } from '../../src/modules/ads/service.js';

const input = { accountId: '123', operationId: 'creative-one', name: 'Offer', pageId: '999', imageBytes: 'aW1n', primaryText: 'See our offer', headline: 'Explore', destinationUrl: 'https://example.com', callToAction: 'LEARN_MORE' };

describe('one creative approval', () => {
  it('creates the complete paused campaign including fresh image upload with one approval', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'campaign-one-approval-'));
    const objects = new Map<string, any>();
    const network = vi.fn(async (raw: any, init: any) => {
      const url = new URL(String(raw));
      if (init.method === 'GET') return new Response(JSON.stringify(objects.get(url.pathname.split('/').at(-1)!)));
      if (url.pathname.endsWith('/adimages')) return new Response('{"images":{"image":{"hash":"new-hash"}}}');
      const body = new URLSearchParams(init.body);
      const id = String(100 + objects.size);
      const values = Object.fromEntries([...body].map(([key, value]) => { try { return [key, JSON.parse(value)]; } catch { return [key, value]; } }));
      objects.set(id, { id, ...values });
      return new Response(JSON.stringify({ id }));
    });
    const ads = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, verifiedAccounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 't' }, fetch: network });
    const spec = { campaign: { name: 'Traffic', objective: 'OUTCOME_TRAFFIC', budgetOwner: 'AD_SET', dailyBudget: 1000, bidStrategy: 'LOWEST_COST_WITHOUT_CAP', specialAdCategories: [] }, adSet: { name: 'Visitors', conversionLocation: 'WEBSITE', performanceGoal: 'LANDING_PAGE_VIEWS', billingEvent: 'IMPRESSIONS', targeting: { countries: ['IN'] }, placements: ['facebook_feed'] }, ad: { name: 'Ad', pageId: '999', creative: { imageBytes: input.imageBytes }, destinationUrl: input.destinationUrl, primaryText: input.primaryText, callToAction: input.callToAction } };
    try {
      await ads.call('meta_ads_readiness', { accountId: '123', snapshot: { businessManagerId: '1', pageId: '999', paymentReady: true, businessVerified: true, adsManagement: true, accessTier: 'Limited', tokenHealthy: true, assetAccessHealthy: true, currency: 'INR', timezone: 'Asia/Kolkata' } });
      expect(await ads.call('ads_launch_meta', { accountId: '123', launchId: 'one-launch', spec })).toMatchObject({ status: 'PENDING_APPROVAL' });
      expect(network).not.toHaveBeenCalled();
      expect((await ads.call('ads_list_operations', {})).data).toHaveLength(1);
      ads.decide('one-launch', true);
      expect(await ads.resume('one-launch')).toMatchObject({ status: 'VERIFIED', result: { ids: { imageHash: 'new-hash' }, delivery: 'PAUSED' } });
      expect(network.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(5);
      expect([...objects.values()].filter(o => o.status).every(o => o.status === 'PAUSED')).toBe(true);
      expect([...objects.values()].find(o => o.object_story_spec).object_story_spec.link_data).toMatchObject({ image_hash: 'new-hash', message: input.primaryText });
      await ads.resume('one-launch');
      expect(network).toHaveBeenCalledTimes(9);
    } finally { ads.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(['success', 'rejection', 'timeout', 'mismatch'])('covers image upload and final copy: %s', async outcome => {
    const dir = mkdtempSync(join(tmpdir(), 'creative-publish-'));
    let creative: any;
    const network = vi.fn(async (url: any, init: any) => {
      if (String(url).includes('/adimages')) return new Response(JSON.stringify({ images: { image: { hash: 'hash' } } }));
      if (init.method === 'POST') {
        if (outcome === 'timeout') throw new TypeError('lost response');
        if (outcome === 'rejection') return new Response('{"error":{"message":"invalid creative"}}', { status: 400 });
        const body = new URLSearchParams(init.body);
        creative = { id: '456', name: body.get('name'), object_story_spec: JSON.parse(body.get('object_story_spec')!) };
        return new Response('{"id":"456"}');
      }
      if (outcome === 'mismatch') creative.object_story_spec.link_data.message = 'different copy';
      return new Response(JSON.stringify(creative));
    });
    const ads = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] }, storageDir: dir, tokens: { meta: 't' }, fetch: network });
    try {
      expect(await ads.call('ads_publish_meta_creative', input)).toMatchObject({ status: 'PENDING_APPROVAL' });
      expect(network).not.toHaveBeenCalled();
      expect((await ads.call('ads_list_operations', {})).data).toHaveLength(1);
      await expect(ads.call('ads_publish_meta_creative', { ...input, primaryText: 'Changed' })).rejects.toThrow('different payload');
      ads.decide(input.operationId, true);
      const result = await ads.resume(input.operationId);
      expect(result.status).toBe(({ success: 'VERIFIED', rejection: 'PARTIAL', timeout: 'UNCERTAIN', mismatch: 'PARTIAL' })[outcome]);
      const calls = network.mock.calls.length;
      await ads.resume(input.operationId);
      expect(network).toHaveBeenCalledTimes(calls);
      if (outcome === 'success') {
        expect(result.result.ids).toEqual({ imageHash: 'hash', creative: '456' });
        expect(creative.object_story_spec.link_data).toMatchObject({ image_hash: 'hash', message: input.primaryText, link: input.destinationUrl });
      }
    } finally { ads.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('rejects invalid media before creating an approval', async () => {
    const ads = new AdsService({ mode: 'live-with-approval', accounts: { meta: ['123'] } });
    try { await expect(ads.call('ads_publish_meta_creative', { ...input, imageBytes: '<script>' })).rejects.toThrow(); }
    finally { ads.close(); }
  });
});
