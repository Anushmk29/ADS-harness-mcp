import fs from 'node:fs';
import path from 'node:path';
import { BusinessConfig } from '../types/index.js';
import { BusinessMemory } from './business-memory.js';
import { CustomerMemory } from './customer-memory.js';
import { BrandMemory } from './brand-memory.js';
import { FeedbackMemory } from './feedback-memory.js';
import { LearningMemory } from './learning-memory.js';
import { logger } from '../observability/logger.js';
import { dataDir, writeFileAtomic } from '../config/paths.js';

export class MemoryManager {
  private static defaultInstance?: MemoryManager;
  private static stores = new Map<string, MemoryManager>();
  private storageDir: string;

  public business: BusinessMemory;
  public customer: CustomerMemory;
  public brand: BrandMemory;
  public feedback: FeedbackMemory;
  public learnings: LearningMemory;

  public constructor(config?: BusinessConfig, storageDir?: string) {
    this.storageDir = storageDir || dataDir();
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this.currentConfig = config;
    this.business = new BusinessMemory(config);
    this.customer = new CustomerMemory();
    this.brand = new BrandMemory(config);
    this.feedback = new FeedbackMemory();
    this.learnings = new LearningMemory(path.join(this.storageDir, 'learnings.sqlite'));

    this.loadAllFromDisk();
  }

  /**
   * One shared instance per storage directory. Without a directory this returns the
   * default store (the first one opened), so every caller sees the same snapshot.
   */
  public static getInstance(config?: BusinessConfig, storageDir?: string): MemoryManager {
    const key = storageDir ? path.resolve(storageDir) : undefined;
    let memory = key ? MemoryManager.stores.get(key)
      : MemoryManager.defaultInstance ?? MemoryManager.stores.get(dataDir());
    if (!memory) {
      memory = new MemoryManager(config, storageDir);
      MemoryManager.stores.set(path.resolve(memory.storageDir), memory);
      MemoryManager.defaultInstance ??= memory;
    } else if (config) {
      // Late-bound config: adopt it and re-sync identity facts
      memory.updateConfig(config);
    }
    return memory;
  }

  /** Replace the live config (e.g. after settings save) and re-sync all memory tiers. */
  public updateConfig(config: BusinessConfig): void {
    this.currentConfig = config;
    this.resyncConfigFacts();
  }

  public static resetInstance(): void {
    MemoryManager.defaultInstance = undefined;
    MemoryManager.stores.clear();
  }

  public persistAllToDisk(): void {
    try {
      const dump = {
        business: this.business.toJSON(),
        customer: this.customer.toJSON(),
        brand: this.brand.toJSON(),
        feedback: this.feedback.toJSON(),
        learnings: this.learnings.toJSON(),
        savedAt: Date.now()
      };

      const dumpPath = path.join(this.storageDir, 'memory-snapshot.json');
      writeFileAtomic(dumpPath, JSON.stringify(dump, null, 2));
      logger.debug('MemoryManager', `Successfully persisted all memory tiers to ${dumpPath}`);
    } catch (e: any) {
      logger.error('MemoryManager', `Failed to persist memory snapshot: ${e.message}`);
    }
  }

  public loadAllFromDisk(): void {
    const dumpPath = path.join(this.storageDir, 'memory-snapshot.json');
    if (fs.existsSync(dumpPath)) {
      try {
        const raw = fs.readFileSync(dumpPath, 'utf8');
        const dump = JSON.parse(raw);
        if (dump.business) this.business.fromJSON(dump.business);
        if (dump.customer) this.customer.fromJSON(dump.customer);
        if (dump.brand) this.brand.fromJSON(dump.brand);
        if (dump.feedback) this.feedback.fromJSON(dump.feedback);
        if (dump.learnings) this.learnings.fromJSON(dump.learnings);
        logger.debug('MemoryManager', 'Successfully reloaded memory snapshot from disk.');

        // Config is the source of truth for business identity and brand facts.
        // Re-sync them so a stale snapshot can never mask an updated config/business.yaml.
        this.resyncConfigFacts();
      } catch (e: any) {
        logger.warn('MemoryManager', `Could not parse memory snapshot: ${e.message}`);
      }
    }
  }

  public resyncConfigFacts(): void {
    try {
      const currentConfig = this.getConfig();
      if (currentConfig) {
        this.business.resyncFromConfig(currentConfig);
        this.brand.resyncFromConfig(currentConfig);
      }
    } catch (e: any) {
      logger.warn('MemoryManager', `Config re-sync skipped: ${e.message}`);
    }
  }

  private currentConfig?: BusinessConfig;

  public getConfig(): BusinessConfig | undefined {
    return this.currentConfig;
  }

  /** Learn from human feedback: store the rule, apply its phrase lists to the brand, persist. */
  public recordFeedback(feedbackText: string, channel = 'general') {
    const rule = this.feedback.extractAndStoreStructuredPreference(feedbackText, channel);
    for (const phrase of rule.avoid ?? []) this.brand.addBannedPhrase(phrase);
    for (const phrase of rule.enforce ?? []) this.brand.addPreferredPhrase(phrase);
    this.persistAllToDisk();
    return rule;
  }

  /** Read model for status/summary views; callers no longer assemble it tier by tier. */
  public summary() {
    return {
      facts: this.business.getAllFacts(),
      personas: this.customer.getAllPersonas(),
      rules: this.feedback.getActiveRules(),
      learnings: this.learnings.list({ minConfidence: 'emerging' })
    };
  }
}
