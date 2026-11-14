import { BusinessConfig } from '../types/index.js';

export interface BrandGuideline {
  voice: string;
  tone: string[];
  positioning: string;
  bannedPhrases: Set<string>;
  preferredPhrases: Set<string>;
  valuePillars: string[];
  messagingRules: string[];
}

export class BrandMemory {
  private voice = '';
  private tone: string[] = [];
  private positioning = '';
  private bannedPhrases: Set<string> = new Set();
  private preferredPhrases: Set<string> = new Set();
  private valuePillars: string[] = [];
  private messagingRules: string[] = [];
  /** Tracks which phrases came from config/business.yaml so settings removals take effect. */
  private configManagedBanned: Set<string> = new Set();
  private configManagedPreferred: Set<string> = new Set();

  constructor(initialConfig?: BusinessConfig) {
    if (initialConfig) this.resyncFromConfig(initialConfig);
  }

  /** Re-sync brand guidelines from the current config (source of truth).
   * Config-managed fields are overwritten. Runtime-learned phrases are tracked
   * separately and always preserved; a phrase removed from config is only dropped
   * if it was never learned at runtime. */
  public resyncFromConfig(config: BusinessConfig): void {
    const b = config.brand;
    this.voice = b.voice;
    this.tone = [...b.tone];
    this.positioning = b.positioning;
    this.valuePillars = [...b.valuePillars];

    const configBanned = new Set(b.bannedPhrases.map(p => p.toLowerCase()));
    const mergedBanned = new Set<string>(configBanned);
    for (const phrase of this.bannedPhrases) {
      if (!this.configManagedBanned.has(phrase) || configBanned.has(phrase)) mergedBanned.add(phrase);
    }
    this.bannedPhrases = mergedBanned;
    this.configManagedBanned = configBanned;

    const configPreferred = new Set(b.preferredPhrases);
    const mergedPreferred = new Set<string>(configPreferred);
    for (const phrase of this.preferredPhrases) {
      if (!this.configManagedPreferred.has(phrase) || configPreferred.has(phrase)) mergedPreferred.add(phrase);
    }
    this.preferredPhrases = mergedPreferred;
    this.configManagedPreferred = configPreferred;

    const mergedRules = [...b.messagingRules];
    for (const rule of this.messagingRules) {
      if (!mergedRules.includes(rule)) mergedRules.push(rule);
    }
    this.messagingRules = mergedRules;
  }

  public addBannedPhrase(phrase: string): void {
    this.bannedPhrases.add(phrase.toLowerCase());
  }

  public addPreferredPhrase(phrase: string): void {
    this.preferredPhrases.add(phrase);
  }

  public getBrandProfile(): BrandGuideline {
    return {
      voice: this.voice,
      tone: [...this.tone],
      positioning: this.positioning,
      bannedPhrases: new Set(this.bannedPhrases),
      preferredPhrases: new Set(this.preferredPhrases),
      valuePillars: [...this.valuePillars],
      messagingRules: [...this.messagingRules]
    };
  }

  public checkTextCompliance(text: string): { compliant: boolean; violations: string[]; score: number } {
    const lower = text.toLowerCase();
    const violations: string[] = [];

    for (const banned of this.bannedPhrases) {
      if (lower.includes(banned)) {
        violations.push(`Contains banned phrase: "${banned}"`);
      }
    }

    const score = violations.length === 0 ? 100 : Math.max(0, 100 - violations.length * 25);
    return {
      compliant: violations.length === 0,
      violations,
      score
    };
  }

  public toJSON(): any {
    return {
      voice: this.voice,
      tone: this.tone,
      positioning: this.positioning,
      bannedPhrases: Array.from(this.bannedPhrases),
      preferredPhrases: Array.from(this.preferredPhrases),
      valuePillars: this.valuePillars,
      messagingRules: this.messagingRules
    };
  }

  public fromJSON(data: any): void {
    if (!data) return;
    this.voice = data.voice || '';
    this.tone = data.tone || [];
    this.positioning = data.positioning || '';
    this.bannedPhrases = new Set((data.bannedPhrases || []).map((p: string) => p.toLowerCase()));
    this.preferredPhrases = new Set(data.preferredPhrases || []);
    this.valuePillars = data.valuePillars || [];
    this.messagingRules = data.messagingRules || [];
  }
}
