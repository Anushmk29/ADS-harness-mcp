import { createDepartment } from '../../departments/runtime.js';
import { MemoryManager } from '../../memory/memory-manager.js';

export async function runIncreaseQualifiedLeadsMission() {
  const runtime = createDepartment('hq', { mode: process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live', memory: MemoryManager.getInstance() });
  const stages: Array<{ stageName: string; capability: string; input: Record<string, unknown>; result?: unknown }> = [
    { stageName: 'Performance audit', capability: 'skill_campaign_analysis', input: { dateRange: 'last_30_days' } },
    { stageName: 'Funnel analysis', capability: 'skill_ga4_analysis', input: { dateRange: 'last_30_days' } },
    { stageName: 'Optimization review', capability: 'skill_campaign_optimization', input: { operations: [] } }
  ];
  try {
    for (const stage of stages) {
      const result = await runtime.run({ capability: stage.capability, input: stage.input, objective: stage.stageName });
      stage.result = result;
      if (result.status !== 'COMPLETED') return { status: 'WAITING_FOR_APPROVAL', stages, summary: 'Mission paused for explicit operations; no approval was simulated.' };
    }
    return { status: 'COMPLETED', stages, summary: 'Mission completed through the department runtime.' };
  } finally {
    await runtime.close();
  }
}
