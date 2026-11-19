import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { createMarketingModules } from '../../src/core/modules/registry.js';

describe('marketing module seams', () => {
  it('registers only the ads module and keeps other departments out of it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'marketing-modules-'));
    const memory = new MemoryManager(undefined, dir);
    const modules = createMarketingModules({ memory, storageDir: dir, mode: 'simulation' });
    try {
      expect(modules.list().map(m => m.id)).toEqual(['ads']);
      expect(() => modules.get('content' as any)).toThrow('Unknown module');
      const ads = modules.get('ads');
      expect(ads.listCapabilities().some(c => c.name.startsWith('ga4_'))).toBe(true);
      expect(ads.listCapabilities().some(c => c.name.startsWith('research_'))).toBe(false);
      await expect(ads.run({ capability: 'research_competitor_ads' })).rejects.toThrow('does not belong to ads');
    } finally {
      await modules.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires approval for every live paid-media write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-module-review-'));
    const network = vi.fn(async () => new Response('{"id":"should-not-run"}'));
    const modules = createMarketingModules({
      storageDir: dir,
      mode: 'live',
      ads: { mode: 'autonomous', accounts: { meta: ['123'] }, tokens: { meta: 'test' }, fetch: network }
    });
    try {
      const result = await modules.get('ads').run({ capability: 'meta_ads_create_campaign', input: { accountId: '123', operationId: 'approval-required', data: { name: 'Paused', objective: 'OUTCOME_LEADS' } } });
      expect(result.status).toBe('PENDING_APPROVAL');
      expect((result.data as any).transitions.map((event: any) => event.status)).toEqual(['DRAFT', 'PENDING_APPROVAL']);
      expect(network).not.toHaveBeenCalled();
    } finally {
      await modules.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves off mode at the public ads module boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-module-off-'));
    const network = vi.fn();
    const modules = createMarketingModules({ storageDir: dir, mode: 'live', ads: { mode: 'off', accounts: { meta: ['123'] }, fetch: network } });
    try {
      const result = await modules.get('ads').run({ capability: 'meta_ads_create_campaign', input: { accountId: '123', operationId: 'off-module', data: { name: 'Off', objective: 'OUTCOME_AWARENESS' } } });
      expect(result.status).toBe('OFF');
      expect(network).not.toHaveBeenCalled();
    } finally { await modules.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('uses the YAML dry-run policy when the module caller omits a mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-module-policy-'));
    const network = vi.fn();
    const modules = createMarketingModules({ storageDir: dir, mode: 'live', ads: { accounts: { meta: ['123'] }, fetch: network } });
    try {
      const result = await modules.get('ads').run({ capability: 'meta_ads_create_campaign', input: { accountId: '123', operationId: 'policy-dry-run', data: { name: 'Dry', objective: 'OUTCOME_AWARENESS' } } });
      expect(result.status).toBe('DRY_RUN');
      expect(network).not.toHaveBeenCalled();
    } finally { await modules.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('routes GA4 approval and resume to the analytics operation owner', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ads-module-ga4-'));
    const network = vi.fn(async () => new Response('{"name":"properties/123/keyEvents/456"}'));
    const modules = createMarketingModules({ storageDir: dir, mode: 'live', ads: { mode: 'live-with-approval', accounts: { ga4: ['123'] }, tokens: { ga4: 'test' }, fetch: network } });
    try {
      const ads = modules.get('ads');
      const pending = await ads.run({ capability: 'ga4_create_keyEvents', input: { accountId: '123', operationId: 'ga4-key-event', data: { eventName: 'purchase' } } });
      expect(pending.status).toBe('PENDING_APPROVAL');
      expect((await ads.run({ capability: 'ads.operation.approve', input: { operationId: 'ga4-key-event' } })).status).toBe('AUTHORIZED');
      expect((await ads.run({ capability: 'ads.operation.resume', input: { operationId: 'ga4-key-event' } })).status).toBe('DISPATCHED');
      expect(network).toHaveBeenCalledTimes(1);
    } finally { await modules.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
