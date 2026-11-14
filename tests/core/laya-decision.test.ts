import { describe, it, expect } from 'vitest';
import { LayaClient } from '../../src/core/decision/laya-client.js';

describe('Laya research filter', () => {
  const laya = LayaClient.getInstance();

  it('filters research relevance and classifies search intent', async () => {
    const validSignal = await laya.filterResearchRelevance(
      'Enterprise dental clinic pricing comparison for WhatsApp automation software',
      'Healthcare AI Automation'
    );
    expect(validSignal.isRelevant).toBe(true);
    expect(['commercial', 'transactional']).toContain(validSignal.intent);

    const spamSignal = await laya.filterResearchRelevance('Free crypto casino bonus win now', 'Healthcare AI');
    expect(spamSignal.isRelevant).toBe(false);
  });
});
