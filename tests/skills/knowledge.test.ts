import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDepartment } from '../../src/departments/runtime.js';
import { knowledgeRoot, readKnowledge } from '../../src/skills/marketing/knowledge.skill.js';

describe('knowledge', () => {
  it('is one router-first reader, runnable from every department, confined to knowledge/', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'knowledge-'));
    const ads = createDepartment('ads', { storageDir: dir, mode: 'simulation' });
    const analytics = createDepartment('analytics', { storageDir: dir, mode: 'simulation' });
    try {
      expect(ads.listCapabilities().map(c => c.name)).toContain('skill_knowledge');
      const index = await analytics.run({ capability: 'skill_knowledge' });
      expect(index.output.router).toContain('When files disagree');
      expect(index.output.files).toEqual(expect.arrayContaining(['ads/our-business-fit.md', 'ads/ppc-math.md', 'creative/SKILL.md', 'creative/sources/copywriting/references/copy-formulas.md']));
      const fit = await ads.run({ capability: 'skill_knowledge', input: { path: 'ads/our-business-fit.md' } });
      expect(fit.output.content).toContain('Where the pages disagree');
      await expect(ads.run({ capability: 'skill_knowledge', input: { path: '../package.json' } })).rejects.toThrow('Unknown knowledge file');
      await expect(ads.run({ capability: 'skill_ga4_analysis', input: {} })).rejects.toThrow('belongs to analytics');
    } finally { await ads.close(); await analytics.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('router only names files that exist', () => {
    const router = readKnowledge().router as string;
    const paths = [...router.matchAll(/`((?:ads|creative|ops)\/[\w./-]+\.(?:md|json))`/g)].map(m => m[1]);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) expect(existsSync(join(knowledgeRoot, path)), path).toBe(true);
    expect(readFileSync(join(knowledgeRoot, 'creative/SKILL.md'), 'utf8')).toContain('Format comes before framework');
  });
});
