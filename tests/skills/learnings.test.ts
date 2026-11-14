import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDepartment } from '../../src/departments/runtime.js';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { DEFAULT_BUSINESS_CONFIG } from '../../src/config/default-config.js';

const DAY = 86_400_000;

describe('skill_learnings', () => {
  it('enforces the confidence rubric, supersedes instead of deleting, and runs in every department', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'learnings-'));
    const ads = createDepartment('ads', { storageDir: dir, mode: 'simulation' });
    const analytics = createDepartment('analytics', { storageDir: dir, mode: 'simulation' });
    const run = (dept: typeof ads, input: Record<string, unknown>) => dept.run({ capability: 'skill_learnings', input });
    try {
      expect(ads.listCapabilities().map(c => c.name)).toContain('skill_learnings');
      await expect(run(ads, { action: 'add', category: 'creative', pattern: 'Missed-call cost ads beat feature ads', evidence: { refs: ['ad_1'] }, confidence: 'validated' })).rejects.toThrow('validated needs');
      await expect(run(ads, { action: 'add', category: 'creative', pattern: 'Missed-call cost ads beat feature ads', confidence: 'hypothesis' })).rejects.toThrow('testPlan');
      const first = (await run(ads, { action: 'add', category: 'creative', pattern: 'Missed-call cost ads beat feature ads', evidence: { refs: ['ad_1'] }, confidence: 'emerging' })).output;
      const second = (await run(analytics, { action: 'add', category: 'creative', pattern: 'Missed-call cost ads beat feature ads 2:1', evidence: { refs: ['ad_1', 'ad_7'] }, confidence: 'validated', supersedes: first.id })).output;
      const listed = (await run(analytics, { action: 'list' })).output.learnings;
      expect(listed.map((l: any) => l.id)).toEqual([second.id]);
      await expect(run(ads, { action: 'add', category: 'nonsense', pattern: 'xxxxxxxxxxxx', confidence: 'emerging' })).rejects.toThrow();
    } finally { await ads.close(); await analytics.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('lists stalled hypotheses in the retro and refuses the removed content actions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'learnings-'));
    const memory = new MemoryManager(DEFAULT_BUSINESS_CONFIG, dir);
    const analytics = createDepartment('analytics', { storageDir: dir, mode: 'simulation', memory });
    try {
      await expect(analytics.run({ capability: 'skill_learnings', input: { action: 'record_result', contentId: 'x', metrics: {} } })).rejects.toThrow();
      memory.learnings.add({ category: 'offer', pattern: 'Clinics prefer a fixed monthly retainer', evidence: { refs: [] }, confidence: 'hypothesis', testPlan: 'Offer both on the next 5 calls' }, Date.now() - 20 * DAY);
      const retro = (await analytics.run({ capability: 'skill_learnings', input: { action: 'retro' } })).output;
      expect(retro.stalledHypotheses).toHaveLength(1);
      expect(retro.stalledHypotheses[0].idleDays).toBeGreaterThanOrEqual(20);
      expect(retro.focus).toContain('stalled');
    } finally { await analytics.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('loads snapshots written by older versions, ignoring the removed demo tiers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'learnings-'));
    try {
      writeFileSync(join(dir, 'memory-snapshot.json'), JSON.stringify({
        experiment: [{ id: 'exp_lp_cta_01', status: 'CONCLUDED', insights: 'fake' }],
        failure: [{ id: 'fail_01' }], performance: [{ totalSpendUSD: 4125 }], strategy: [{ id: 'strat_v1_0' }],
        learnings: [{ id: 'L-1', pattern: 'Real one', confidence: 'emerging', status: 'open', evidence: { refs: ['cnt_1'] }, capturedAt: 1, updatedAt: 1, category: 'icp' }]
      }));
      const summary = new MemoryManager(DEFAULT_BUSINESS_CONFIG, dir).summary();
      expect(Object.keys(summary).sort()).toEqual(['facts', 'learnings', 'personas', 'rules']);
      expect(summary.learnings.map(l => l.id)).toEqual(['L-1']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
