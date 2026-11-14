import { randomUUID } from 'node:crypto';
import { StructuredPreferenceRule } from '../types/index.js';

export class FeedbackMemory {
  private rules: Map<string, StructuredPreferenceRule> = new Map();

  private addRule(rule: Omit<StructuredPreferenceRule, 'id' | 'createdAt'>): StructuredPreferenceRule {
    const id = `pref_${randomUUID()}`;
    const fullRule: StructuredPreferenceRule = {
      id,
      createdAt: Date.now(),
      ...rule
    };
    this.rules.set(id, fullRule);
    return fullRule;
  }

  public extractAndStoreStructuredPreference(rawFeedback: string, category = 'general'): StructuredPreferenceRule {
    const lower = rawFeedback.toLowerCase();
    let type: StructuredPreferenceRule['type'] = 'brand_preference';
    const avoid: string[] = [];
    const enforce: string[] = [];
    let preference = rawFeedback;

    if (lower.includes('corporate') || lower.includes('formal') || lower.includes('tone') || lower.includes('voice')) {
      type = 'tone_rule';
      if (lower.includes('too corporate') || lower.includes('less corporate') || lower.includes('avoid overly corporate')) {
        avoid.push('overly corporate jargon', 'stiff corporate phrasing');
        enforce.push('conversational and engineering-grounded tone');
        preference = 'Maintain conversational, engineering-grounded tone; avoid stiff corporate phrasing.';
      }
    } else if (lower.includes('ad') || lower.includes('creative') || lower.includes('hook')) {
      type = 'creative_preference';
      if (lower.includes('poor quality') || lower.includes('bad leads')) {
        avoid.push('vague hype hooks', 'generic claim ads');
        enforce.push('qualification-first messaging with concrete ICP requirements');
        preference = 'Require qualification-first ad hooks with explicit B2B qualification filters.';
      }
    } else if (lower.includes('budget') || lower.includes('spend') || lower.includes('expensive')) {
      type = 'budget_rule';
      preference = 'Enforce stricter ROAS/CPA thresholds before increasing daily budgets.';
    }

    return this.addRule({
      type,
      category,
      preference,
      avoid,
      enforce,
      source: 'human_feedback',
      confidence: 0.95,
      active: true
    });
  }

  public getActiveRules(): StructuredPreferenceRule[] {
    return Array.from(this.rules.values()).filter(r => r.active);
  }

  public toJSON(): StructuredPreferenceRule[] {
    return Array.from(this.rules.values());
  }

  public fromJSON(data: StructuredPreferenceRule[]): void {
    if (!data) return;
    this.rules.clear();
    for (const r of data) {
      this.rules.set(r.id, r);
    }
  }
}
