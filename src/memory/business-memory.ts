import { BusinessConfig } from '../types/index.js';

/** Business identity facts. Config is the source of truth; the snapshot only serves runs with no config. */
export class BusinessMemory {
  private facts: Record<string, any> = {};

  constructor(initialConfig?: BusinessConfig) {
    if (initialConfig) this.resyncFromConfig(initialConfig);
  }

  public resyncFromConfig(config: BusinessConfig): void {
    const biz = config.business;
    Object.assign(this.facts, {
      business_name: biz.name,
      industry: biz.industry,
      website: biz.website,
      description: biz.description,
      business_model: biz.businessModel,
      sales_cycle_days: biz.salesCycleDays,
      current_cac: biz.currentCAC,
      target_cac: biz.targetCAC,
      avg_ltv: biz.avgCustomerLTV,
      products: biz.products,
      target_markets: biz.targetMarket,
      geographies: biz.geography
    });
  }

  public getFact(key: string): any {
    return this.facts[key];
  }

  public getAllFacts(): Record<string, any> {
    return { ...this.facts };
  }

  public toJSON(): Record<string, any> {
    return this.facts;
  }

  /** Accepts the current object shape and the older array-of-facts snapshot shape. */
  public fromJSON(data: Record<string, any> | Array<{ key: string; value: any }>): void {
    this.facts = Array.isArray(data) ? Object.fromEntries(data.map(fact => [fact.key, fact.value])) : { ...data };
  }
}
