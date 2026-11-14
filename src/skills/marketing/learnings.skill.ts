import { z } from 'zod';
import { confidenceLevels, learningCategories } from '../../memory/learning-memory.js';
import type { MemoryManager } from '../../memory/memory-manager.js';
import type { SkillDefinition } from '../skill-types.js';

const DAY = 86_400_000;
const evidence = z.object({ refs: z.array(z.string().min(1)).default([]), sampleSize: z.number().int().nonnegative().optional() }).strict();
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), category: z.enum(learningCategories), pattern: z.string().min(10), evidence: evidence.default({ refs: [] }), confidence: z.enum(confidenceLevels), testPlan: z.string().optional(), supersedes: z.string().optional(), fromSkill: z.string().optional() }).strict(),
  z.object({ action: z.literal('update_status'), id: z.string(), status: z.enum(['confirmed', 'ruled_out']), evidenceRef: z.string().min(1) }).strict(),
  z.object({ action: z.literal('list'), category: z.enum(learningCategories).optional(), minConfidence: z.enum(confidenceLevels).optional() }).strict(),
  z.object({ action: z.literal('retro'), days: z.number().int().positive().max(90).default(7) }).strict()
]);

function retro(memory: MemoryManager, days: number, now = Date.now()) {
  const since = now - days * DAY;
  const learnings = memory.learnings.all();
  const stalled = learnings.filter(l => l.status === 'open' && l.confidence === 'hypothesis' && !l.supersededBy && l.updatedAt < now - 14 * DAY)
    .map(l => ({ id: l.id, pattern: l.pattern, testPlan: l.testPlan, idleDays: Math.floor((now - l.updatedAt) / DAY) }));
  const newLearnings = learnings.filter(l => l.capturedAt >= since);
  const focus = stalled.length ? `Run the test for the longest-stalled hypothesis ${stalled.sort((a, b) => b.idleDays - a.idleDays)[0].id}, or rule it out`
    : newLearnings.length ? 'Check this window\'s new learnings against the account data and confirm or rule them out' : 'Nothing was learned in this window; record one result from the ad accounts';
  return {
    window: { days, since: new Date(since).toISOString() },
    newLearnings,
    stalledHypotheses: stalled,
    ruledOut: learnings.filter(l => l.status === 'ruled_out').map(l => ({ id: l.id, pattern: l.pattern })),
    focus
  };
}

export const learningsSkill: SkillDefinition = {
  id: 'skill_learnings',
  name: 'Results and Learnings',
  description: 'The harness memory of what actually worked. input.action: "list" before planning ads (use what is known, do not re-test settled points); "add" a learning (category, one-sentence pattern, evidence refs, confidence); "update_status" to confirm or rule out; "retro" weekly (stalled hypotheses, new learnings, one focus). Confidence rules are enforced: validated needs sampleSize >= 30 or 2+ evidence refs, emerging needs 1 ref, hypothesis needs a testPlan. Never add a learning without real evidence. Method: knowledge ops/learning-loop.md.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'update_status', 'list', 'retro'] },
      category: { type: 'string', enum: [...learningCategories] },
      pattern: { type: 'string', description: 'One declarative sentence, no hedging' },
      evidence: { type: 'object', properties: { refs: { type: 'array', items: { type: 'string' } }, sampleSize: { type: 'integer' } }, additionalProperties: false },
      confidence: { type: 'string', enum: [...confidenceLevels] },
      testPlan: { type: 'string' },
      supersedes: { type: 'string' },
      fromSkill: { type: 'string' },
      id: { type: 'string' },
      status: { type: 'string', enum: ['confirmed', 'ruled_out'] },
      evidenceRef: { type: 'string' },
      minConfidence: { type: 'string', enum: [...confidenceLevels] },
      days: { type: 'integer' }
    },
    required: ['action'],
    additionalProperties: false
  },
  execute: async ({ inputData, memory }) => {
    const input = inputSchema.parse(inputData);
    switch (input.action) {
      case 'add': { const { action, ...learning } = input; return memory.learnings.add(learning); }
      case 'update_status': return memory.learnings.setStatus(input.id, input.status, input.evidenceRef);
      case 'list': return { learnings: memory.learnings.list(input) };
      case 'retro': return retro(memory, input.days);
    }
  }
};
