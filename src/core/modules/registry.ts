import { AdsModule } from '../../modules/ads/index.js';
import { MemoryManager } from '../../memory/memory-manager.js';
import type { DepartmentOptions } from '../../departments/runtime.js';
import type { MarketingModule, ModuleId } from './contracts.js';

export function createMarketingModules(options: DepartmentOptions = {}) {
  const memory = options.memory ?? MemoryManager.getInstance(options.config, options.storageDir);
  const modules = new Map<ModuleId, MarketingModule>([
    ['ads', new AdsModule({ ...options, memory })]
  ]);
  return {
    get(id: ModuleId): MarketingModule {
      const module = modules.get(id);
      if (!module) throw new Error(`Unknown module: ${id}`);
      return module;
    },
    list: () => [...modules.values()],
    close: () => Promise.all([...modules.values()].map(module => module.close())).then(() => undefined)
  };
}
