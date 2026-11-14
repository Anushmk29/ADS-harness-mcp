import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdsService } from '../../src/modules/ads/service.js';

const service = (fetch: any) => new AdsService({ storageDir: mkdtempSync(join(tmpdir(), 'retry-')), tokens: { meta: 't' }, fetch, retryDelaysMs: [0, 0, 0] } as any);

describe('ads transport read retries', () => {
  it('retries a read on 503 and on a network error, then succeeds', async () => {
    const network = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"busy"}}', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('{"data":[]}'));
    const ads = service(network);
    const result = await ads.call('meta_ads_list_accounts', {});
    expect(result.status).toBe('COMPLETED');
    expect(network).toHaveBeenCalledTimes(3);
    ads.close();
  });

  it('gives up after 3 retries', async () => {
    const network = vi.fn(async () => new Response('{"error":{"message":"busy"}}', { status: 500 }));
    const ads = service(network);
    const result: any = await ads.call('meta_ads_list_accounts', {}).catch((e: Error) => ({ status: 'FAILED', error: e.message }));
    expect(result.status).toBe('FAILED');
    expect(network).toHaveBeenCalledTimes(4);
    ads.close();
  });
});
