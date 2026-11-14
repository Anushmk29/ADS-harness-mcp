import type { MCPClient } from '../mcp/mcp-client.js';

export function createProviderLoader(mode: 'simulation' | 'live' = 'live') {
  const pending = new Map<string, Promise<void>>();
  return async (name: string, client: MCPClient): Promise<void> => {
    const prefix = name.startsWith('google_ads_') ? 'google_ads' : name.startsWith('meta_ads_') ? 'meta_ads' : name.split('_')[0];
    if (!pending.has(prefix)) {
      const loading = (async () => {
        if (['google_ads', 'meta_ads', 'ga4'].includes(prefix) && mode === 'live') {
          const { AdsConfigLoader } = await import('../modules/ads/providers/ads-config.js');
          const cfg = AdsConfigLoader.loadDefault();
          const platform = prefix as 'google_ads' | 'meta_ads' | 'ga4';
          if (cfg[platform].mode === 'off') throw new Error(`${platform} is disabled. Configure config/ads.yaml before live use.`);
          const selected = { ...cfg, google_ads: { ...cfg.google_ads, mode: 'off' as const }, meta_ads: { ...cfg.meta_ads, mode: 'off' as const }, ga4: { ...cfg.ga4, mode: 'off' as const } };
          selected[platform] = cfg[platform] as any;
          const serverId = platform === 'ga4' ? 'ga4-mcp' : platform.replace('_', '-') + '-mcp';
          client.registerServer({ id: serverId, name: platform, version: '1', capabilities: [] });
          (await import('../modules/ads/providers/direct-adapter.js')).registerDirectAdapters(client, selected);
          return;
        }
        if (mode !== 'simulation') throw new Error(`${prefix} has no live connector. Supply a connector or select simulation explicitly.`);
        switch (prefix) {
          case 'google_ads': return (await import('../modules/ads/providers/google-ads-mcp.js')).registerGoogleAdsMCP(client);
          case 'meta_ads': return (await import('../modules/ads/providers/meta-ads-mcp.js')).registerMetaAdsMCP(client);
          case 'ga4': return (await import('../modules/ads/providers/ga4-mcp.js')).registerGA4MCP(client);
          case 'research': return (await import('../mcp/integrations/web-research-mcp.js')).registerWebResearchMCP(client);
          default: throw new Error(`Unknown tool provider: ${name}`);
        }
      })();
      pending.set(prefix, loading);
      loading.catch(() => pending.delete(prefix));
    }
    await pending.get(prefix);
  };
}
