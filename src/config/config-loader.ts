import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { DEFAULT_BUSINESS_CONFIG } from './default-config.js';
import { writeFileAtomic } from './paths.js';

export const BusinessConfigSchema = z.object({
  business: z.object({
    id: z.string(),
    name: z.string(),
    industry: z.string(),
    website: z.string(),
    description: z.string(),
    products: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
        pricing: z.object({
          model: z.string(),
          amount: z.number(),
          currency: z.string()
        }),
        valueProposition: z.string(),
        differentiators: z.array(z.string()),
        marginsPercent: z.number(),
        targetAudienceId: z.string()
      })
    ),
    services: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        pricingModel: z.string(),
        targetAudienceId: z.string()
      })
    ),
    targetMarket: z.array(z.string()),
    geography: z.array(z.string()),
    businessModel: z.enum(['B2B_SAAS', 'B2B_SERVICE', 'B2C_ECOMMERCE', 'B2C_SUBSCRIPTION', 'HYBRID']),
    salesCycleDays: z.number(),
    avgCustomerLTV: z.number(),
    currentCAC: z.number(),
    targetCAC: z.number()
  }),
  brand: z.object({
    voice: z.string(),
    tone: z.array(z.string()),
    positioning: z.string(),
    bannedPhrases: z.array(z.string()),
    preferredPhrases: z.array(z.string()),
    valuePillars: z.array(z.string()),
    messagingRules: z.array(z.string()),
    // Visual identity for generated ad creatives (src/modules/creative). Optional so older configs still load.
    visual: z.object({
      colors: z.object({ primary: z.string(), secondary: z.string(), background: z.string(), text: z.string() }),
      mood: z.array(z.string()),
      texture: z.string(),
      negativeSpace: z.string(),
      forbidden: z.array(z.string()),
      wordmark: z.string().optional()
    }).optional()
  }),
  marketing: z.object({
    objectives: z.array(z.string()),
    primaryKPIs: z.record(z.union([z.string(), z.number()])),
    secondaryKPIs: z.record(z.union([z.string(), z.number()])),
    monthlyBudget: z.object({
      total: z.number(),
      currency: z.string(),
      allocations: z.record(z.number())
    }),
    channels: z.array(z.string())
  })
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;

export class ConfigLoader {
  private static cachedConfig: BusinessConfig | null = null;

  public static loadConfig(filePath?: string): BusinessConfig {
    if (this.cachedConfig && !filePath) {
      return this.cachedConfig;
    }

    const resolvedPath = filePath || path.join(process.cwd(), 'config', 'business.yaml');

    if (fs.existsSync(resolvedPath)) {
      try {
        const fileContent = fs.readFileSync(resolvedPath, 'utf8');
        const parsed = YAML.parse(fileContent);
        const validated = BusinessConfigSchema.parse(parsed);
        this.cachedConfig = validated;
        return validated;
      } catch (err: any) {
        if (process.env.NODE_ENV === 'production') throw new Error(`[ConfigLoader] Invalid ${resolvedPath}: ${err.message}`);
        console.warn(`[ConfigLoader] Warning reading ${resolvedPath}: ${err.message}. Falling back to default configuration.`);
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error(`[ConfigLoader] Missing ${resolvedPath}; a production deployment must have its own business config.`);
    }

    this.cachedConfig = DEFAULT_BUSINESS_CONFIG;
    return DEFAULT_BUSINESS_CONFIG;
  }

  /** First configured product audience; replaces the old hardcoded 'aud_b2b_operator'. */
  public static defaultAudienceId(): string {
    return this.loadConfig().business.products?.find(p => p.targetAudienceId)?.targetAudienceId ?? 'aud_default';
  }

  public static saveConfig(config: BusinessConfig, filePath?: string): void {
    const resolvedPath = filePath || path.join(process.cwd(), 'config', 'business.yaml');
    writeFileAtomic(resolvedPath, YAML.stringify(config));
    this.cachedConfig = config;
  }

  /** Validate a change against the schema, write business.yaml, and return the reloaded config. */
  public static update(change: (current: BusinessConfig) => unknown): BusinessConfig {
    const validated = BusinessConfigSchema.parse(change(structuredClone(this.loadConfig())));
    this.saveConfig(validated);
    this.resetCache();
    return this.loadConfig();
  }

  public static resetCache(): void {
    this.cachedConfig = null;
  }
}
