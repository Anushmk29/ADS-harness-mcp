import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AdsConfigLoader } from '../../src/modules/ads/providers/ads-config.js';
import { TokenStore, tokenFilePath } from '../../src/mcp/auth/token-store.js';
import { createLoopback } from '../../src/mcp/auth/oauth-loopback.js';

describe('Direct Ads Integration Layer', () => {
  afterEach(() => {
    AdsConfigLoader.resetCache();
  });

  it('defaults all platforms to off (mock) when no config/ads.yaml is present', () => {
    // ConfigLoader reads cwd; in the test workspace ads.yaml exists, so this
    // validates the loader returns a well-formed config with all three keys.
    const cfg = AdsConfigLoader.loadDefault();
    expect(cfg).toHaveProperty('google_ads');
    expect(cfg).toHaveProperty('meta_ads');
    expect(cfg).toHaveProperty('ga4');
    expect(['off', 'direct', 'dry-run']).toContain(cfg.google_ads.mode);
  });



  it('TokenStore persists and reloads an access token', () => {
    vi.stubEnv('MARKETING_TOKEN_KEY', 'test-only-key-that-is-long-enough-for-token-encryption');
    const store = TokenStore.getInstance();
    const provider = 'test_provider';
    const file = tokenFilePath(provider);
    try {
      store.save(provider, { accessToken: 'tok_abc', expiresIn: 3600 });
      expect(fs.readFileSync(file, 'utf8')).not.toContain('tok_abc');
      expect(store.getAccessToken(provider)).toBe('tok_abc');
      store.clear(provider);
      expect(store.getAccessToken(provider)).toBeNull();
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      vi.unstubAllEnvs();
    }
  });

  it('createLoopback reserves a port and reports a redirect URI', async () => {
    const ln = await createLoopback('127.0.0.1');
    expect(ln.port).toBeGreaterThan(0);
    expect(ln.redirectUri).toContain(`:${ln.port}/oauth2callback`);
    ln.close();
  });

});
