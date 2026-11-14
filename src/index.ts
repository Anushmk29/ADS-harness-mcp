import { ConfigLoader } from './config/config-loader.js';
import { MCPClient } from './mcp/mcp-client.js';
import { MemoryManager } from './memory/memory-manager.js';
import { createDepartment } from './departments/runtime.js';
import { createProviderLoader } from './departments/providers.js';

export function initializeMarketingHarness(customConfigPath?: string) {
  const config = ConfigLoader.loadConfig(customConfigPath);
  const memory = MemoryManager.getInstance(config);
  // Ensure a stale persisted snapshot never masks the live config/business.yaml
  if (customConfigPath) {
    ConfigLoader.resetCache();
  }
  const mode = process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live';
  return {
    departments: createDepartment('hq', { config, memory, mode }),
    config,
    memory,
    mcp: new MCPClient(createProviderLoader(mode))
  };
}

export * from './types/index.js';
export * from './config/config-loader.js';
export * from './config/default-config.js';
export * from './memory/memory-manager.js';
export * from './mcp/mcp-client.js';
export * from './modules/ads/providers/ads-config.js';
export * from './mcp/auth/token-store.js';
export * from './core/deepseek/deepseek-brain.js';
export * from './observability/logger.js';
export * from './observability/audit-trail.js';
export * from './workflows/daily-loop.js';
export * from './workflows/missions/increase-qualified-leads.js';
export * from './visualization/event-bus.js';
export * from './visualization/office-mapper.js';
export * from './visualization/agent-state-adapter.js';
export * from './server/server.js';
export * from './core/modules/contracts.js';
export * from './core/modules/registry.js';
export * from './modules/ads/index.js';
export * from './core/client/core-store.js';
export * from './ops/doctor.js';
export * from './ops/backup.js';
export * from './departments/scheduler.js';
export * from './observability/alerts.js';
export * from './core/tracking/store.js';
export * from './core/tracking/kpi-snapshot.js';
export * from './core/llm/index.js';
export * from './core/tracking/reports.js';
export * from './ops/summary.js';
export * from './ops/google.js';
