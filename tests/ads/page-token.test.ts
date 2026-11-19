import { describe, expect, it } from 'vitest';
import { AdsTransport } from '../../src/modules/ads/transport.js';
import { adsToolMap } from '../../src/modules/ads/tools.js';

describe('page-scoped Meta reads', () => {
  it('swaps the system token for the Page token and caches it', async () => {
    const calls: Array<{ path: string; auth: string }> = [];
    const fetch = (async (url: URL, init: RequestInit) => {
      const auth = String((init.headers as Record<string, string>).Authorization);
      calls.push({ path: url.pathname + url.search, auth });
      if (url.pathname.endsWith('/777') && url.searchParams.get('fields') === 'access_token') return new Response(JSON.stringify({ access_token: 'PAGE-TOKEN', id: '777' }));
      return new Response(JSON.stringify({ data: [{ id: 'form1' }] }));
    }) as unknown as typeof globalThis.fetch;
    const transport = new AdsTransport({ tokens: { meta: 'SYSTEM-TOKEN' }, fetch, metaVersion: 'v23.0' });
    const tool = adsToolMap.get('meta_ads_list_lead_form')!;
    const args = { accountId: 'act_1', parentId: '777', fields: ['id'], params: {} };
    expect((await transport.dispatch(tool, args)).data).toEqual([{ id: 'form1' }]);
    await transport.dispatch(tool, args);
    expect(calls.filter(c => c.path.includes('fields=access_token'))).toHaveLength(1);
    expect(calls.filter(c => c.path.includes('leadgen_forms')).every(c => c.auth === 'Bearer PAGE-TOKEN')).toBe(true);
  });

  it('keeps the system token for account-scoped reads', async () => {
    const auths: string[] = [];
    const fetch = (async (_url: URL, init: RequestInit) => { auths.push(String((init.headers as Record<string, string>).Authorization)); return new Response(JSON.stringify({ data: [] })); }) as unknown as typeof globalThis.fetch;
    const transport = new AdsTransport({ tokens: { meta: 'SYSTEM-TOKEN' }, fetch, metaVersion: 'v23.0' });
    await transport.dispatch(adsToolMap.get('meta_ads_list_campaign')!, { accountId: 'act_1', fields: ['id'], params: {} });
    expect(auths).toEqual(['Bearer SYSTEM-TOKEN']);
  });

  it('fails clearly when the token has no Page access', async () => {
    const fetch = (async () => new Response(JSON.stringify({ id: '777' }))) as unknown as typeof globalThis.fetch;
    const transport = new AdsTransport({ tokens: { meta: 'SYSTEM-TOKEN' }, fetch, metaVersion: 'v23.0' });
    await expect(transport.dispatch(adsToolMap.get('meta_ads_list_lead_form')!, { accountId: 'act_1', parentId: '777', fields: ['id'], params: {} })).rejects.toThrow(/no Page access/);
  });
});
