import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { DEFAULT_BUSINESS_CONFIG } from '../../src/config/default-config.js';

describe('Memory Subsystem & Knowledge Graph Tests', () => {
  let memory: MemoryManager;

  beforeEach(() => {
    memory = MemoryManager.getInstance(DEFAULT_BUSINESS_CONFIG);
  });

  it('correctly initializes Business Memory from single business configuration', () => {
    const bizName = memory.business.getFact('business_name');
    expect(bizName).toBe(DEFAULT_BUSINESS_CONFIG.business.name);

    const targetCAC = memory.business.getFact('target_cac');
    expect(targetCAC).toBe(3500);

    const products = memory.business.getFact('products');
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].name).toBe(DEFAULT_BUSINESS_CONFIG.business.products[0].name);
  });

  it('enforces brand voice compliance and detects banned promotional hype phrases', () => {
    const badCopy = 'In today’s fast-paced digital landscape, unleash the power of AI to revolutionize your business!';
    const checkBad = memory.brand.checkTextCompliance(badCopy);
    expect(checkBad.compliant).toBe(false);
    expect(checkBad.violations.length).toBeGreaterThan(0);

    const goodCopy = 'ApexScale AI provides deterministic attribution and compresses CAC payback periods.';
    const checkGood = memory.brand.checkTextCompliance(goodCopy);
    expect(checkGood.compliant).toBe(true);
    expect(checkGood.score).toBe(100);
  });
});

describe('shared Marketing Memory store', () => {
  it('preserves independent writers and imports old snapshots without reverting database updates', async () => {
    const { mkdtempSync, rmSync, writeFileSync, existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createDepartment } = await import('../../src/departments/runtime.js');
    const dir = mkdtempSync(join(tmpdir(), 'memory-writers-'));
    try {
      const a = new MemoryManager(DEFAULT_BUSINESS_CONFIG, dir), b = new MemoryManager(DEFAULT_BUSINESS_CONFIG, dir);
      const input = { category: 'ops' as const, pattern: 'Independent observed result', evidence: { refs: ['proof'] }, confidence: 'emerging' as const };
      const first = a.learnings.add(input);
      b.learnings.add({ ...input, pattern: 'Another independent observation' });
      expect(a.learnings.all()).toHaveLength(2);
      b.learnings.setStatus(first.id, 'confirmed', 'new-proof');
      writeFileSync(join(dir, 'memory-snapshot.json'), JSON.stringify({ learnings: [{ ...first, status: 'open' }] }));
      const reloaded = new MemoryManager(DEFAULT_BUSINESS_CONFIG, dir);
      expect(reloaded.learnings.all()).toHaveLength(2);
      expect(reloaded.learnings.get(first.id)).toMatchObject({ status: 'confirmed', evidence: { refs: ['proof', 'new-proof'] } });
      const snapshot = join(dir, 'memory-snapshot.json');
      const { readFileSync } = await import('node:fs');
      const before = readFileSync(snapshot, 'utf8');
      const runtime = createDepartment('ads', { memory: reloaded });
      try { await runtime.run({ capability: 'skill_learnings', input: { action: 'list' } }); } finally { await runtime.close(); }
      expect(readFileSync(snapshot, 'utf8')).toBe(before);
      expect(existsSync(join(dir, 'learnings.sqlite'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('department runs without an injected memory write to the store everyone reads', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createDepartment } = await import('../../src/departments/runtime.js');
    const dir = mkdtempSync(join(tmpdir(), 'shared-memory-'));
    try {
      const reader = MemoryManager.getInstance(DEFAULT_BUSINESS_CONFIG, dir);
      expect(MemoryManager.getInstance(undefined, dir)).toBe(reader);
      const before = reader.learnings.all().length;
      const analytics = createDepartment('analytics', { mode: 'simulation', storageDir: dir, config: DEFAULT_BUSINESS_CONFIG });
      await analytics.run({ capability: 'skill_learnings', input: { action: 'add', category: 'creative', pattern: 'Weekend enquiry leak ads win on cost per lead', evidence: { refs: ['ad_1'] }, confidence: 'emerging' } });
      await analytics.close();
      expect(reader.learnings.all().length).toBeGreaterThan(before);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
