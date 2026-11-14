import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

/**
 * Direct ads integration configuration (config/ads.yaml).
 *
 * Each platform is independent and can run in one of three modes:
 *   - "off"     : integration not enabled; the existing mock/simulated adapters remain.
 *   - "direct"  : talk straight to the platform's real API using the credentials in
 *                 ADS_DIRECT_* environment variables (never committed).
 *   - "dry-run" : same as direct, but every WRITE is staged for HITL approval and,
 *                 even when approved, is NOT actually sent to the platform. Reads are live.
 *
 * Writes are always journaled and require approval (see modules/ads/journal.ts).
 */

const platform = z.object({
  mode: z.enum(['off', 'direct', 'dry-run']).default('off'),
  /** Default account/customer identifier used when a tool call omits it. */
  defaultAccountId: z.string().nullable().optional()
});
// Credentials come only from ADS_DIRECT_* environment variables (see config/ads.yaml).
const AdsDirectConfigSchema = z.object({ google_ads: platform, meta_ads: platform, ga4: platform });
export type AdsDirectConfig = z.infer<typeof AdsDirectConfigSchema>;

export class AdsConfigLoader {
  private static cached: AdsDirectConfig | null = null;

  public static loadDefault(): AdsDirectConfig {
    if (AdsConfigLoader.cached) return AdsConfigLoader.cached;
    const resolved = path.join(process.cwd(), 'config', 'ads.yaml');
    if (fs.existsSync(resolved)) {
      try {
        const content = fs.readFileSync(resolved, 'utf8');
        const parsed = YAML.parse(content);
        const valid = parsed && (parsed as any).ads ? (parsed as any).ads : parsed;
        AdsConfigLoader.cached = AdsDirectConfigSchema.parse(valid);
        return AdsConfigLoader.cached;
      } catch (err: any) {
        console.warn(`[AdsConfig] Failed to parse config/ads.yaml: ${err.message}. Using defaults (all platforms off).`);
      }
    }
    AdsConfigLoader.cached = AdsDirectConfigSchema.parse({ google_ads: {}, meta_ads: {}, ga4: {} });
    return AdsConfigLoader.cached;
  }

  public static resetCache(): void {
    AdsConfigLoader.cached = null;
  }
}