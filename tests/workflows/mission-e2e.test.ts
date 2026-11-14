import { describe, it, expect, vi } from 'vitest';
import { initializeMarketingHarness } from '../../src/index.js';
import { runIncreaseQualifiedLeadsMission } from '../../src/workflows/missions/increase-qualified-leads.js';
import { MemoryManager } from '../../src/memory/memory-manager.js';
import { ConfigLoader } from '../../src/config/config-loader.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('End-to-End Autonomous Marketing Mission Flow', () => {
  it('runs explicit simulation work and stops for a real decision rather than fabricating approval', async () => {
    vi.stubEnv('MARKETING_MODE', 'simulation');
    const directory = mkdtempSync(join(tmpdir(), 'marketing-mission-'));
    MemoryManager.resetInstance();
    MemoryManager.getInstance(ConfigLoader.loadConfig(), directory);
    try {
    const harness = initializeMarketingHarness();

    const result = await runIncreaseQualifiedLeadsMission();

    expect(result.status).toBe('WAITING_FOR_APPROVAL');
    expect(result.stages.length).toBe(3);
    expect(result.summary).toContain('no approval was simulated');

    // Verify Business Brain remains uncorrupted
    const biz = harness.memory.business.getAllFacts();
    expect(biz.business_name).toBe(harness.config.business.name);

    expect(result.stages.at(-1)?.result).toMatchObject({ status: 'PENDING' });
    } finally { vi.unstubAllEnvs(); MemoryManager.resetInstance(); rmSync(directory, { recursive: true, force: true }); }
  });
});
