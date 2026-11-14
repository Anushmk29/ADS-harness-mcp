import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MCPClient } from '../mcp/mcp-client.js';
import { departmentIds, skillCatalog, toolDepartment, type DepartmentId } from './catalog.js';
import { createProviderLoader } from './providers.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { BusinessConfig } from '../types/index.js';
import type { AdsOptions } from '../modules/ads/service.js';

export interface DepartmentOptions {
  mode?: 'live' | 'simulation'; storageDir?: string; config?: BusinessConfig;
  memory?: MemoryManager; client?: MCPClient; ads?: AdsOptions;
  onEvent?: (event: { department: DepartmentId; taskId: string; status: string; capability: string }) => void;
}
const taskSchema = z.object({ capability: z.string().min(1), input: z.record(z.unknown()).default({}), objective: z.string().optional(), taskId: z.string().uuid().optional() }).strict();
export type DepartmentTask = z.input<typeof taskSchema>;

export function createDepartment(id: DepartmentId, options: DepartmentOptions = {}) {
  if (!departmentIds.includes(id)) throw new Error(`Unknown department: ${id}`);
  let closed = false;
  let memory = options.memory;
  const client = options.client ?? new MCPClient(createProviderLoader(options.mode), false);
  let ads: Promise<import('../modules/ads/service.js').AdsService> | undefined;
  const active = new Set<Promise<unknown>>();
  const children = new Map<DepartmentId, ReturnType<typeof createDepartment>>();
  const emit = (taskId: string, status: string, capability: string) => {
    try { options.onEvent?.({ department: id, taskId, status, capability }); } catch { /* Observers cannot change execution. */ }
  };
  const getAds = () => ads ??= import('../modules/ads/service.js').then(({ AdsService }) => new AdsService({ storageDir: options.storageDir, ...options.ads, platforms: id === 'analytics' ? ['ga4'] : ['meta', 'google'] }));
  return {
    id,
    listCapabilities() {
      return Object.entries(skillCatalog).filter(([, entry]) => (id === 'hq' || entry.department === id || entry.shared) && !(entry.live === false && (options.mode ?? 'live') === 'live'))
        .map(([name, entry]) => ({ name, department: entry.department, kind: 'skill' as const }));
    },
    async listTools() {
      if (id === 'ads' || id === 'analytics') return (await getAds()).listTools().filter(t => toolDepartment(t.name) === id);
      return client.listTools();
    },
    async run(rawTask: DepartmentTask): Promise<{ taskId: string; department: DepartmentId; mode: string; status: string; output: any }> {
      if (closed) throw new Error(`Department ${id} is closed`);
      const task = taskSchema.parse(rawTask);
      const owner = skillCatalog[task.capability]?.department ?? toolDepartment(task.capability);
      if (!owner) throw new Error(`Unknown capability: ${task.capability}`);
      if (skillCatalog[task.capability]?.live === false && (options.mode ?? 'live') === 'live') throw new Error(`${task.capability} is a template skill with no live implementation; it is disabled in live mode`);
      if (owner !== id && !skillCatalog[task.capability]?.shared) {
        if (id !== 'hq') throw new Error(`${task.capability} belongs to ${owner}, not ${id}`);
        let child = children.get(owner);
        if (!child) { child = createDepartment(owner, options); children.set(owner, child); }
        return child.run(task);
      }
      const taskId = task.taskId ?? randomUUID();
      const work = (async () => {
        emit(taskId, 'RUNNING', task.capability);
        try {
          let output: any;
          const entry = skillCatalog[task.capability];
          if (entry) {
            const skill = await entry.load();
            if (!memory) {
              const { MemoryManager } = await import('../memory/memory-manager.js');
              const config = options.config ?? (await import('../config/config-loader.js')).ConfigLoader.loadConfig();
              memory = MemoryManager.getInstance(config, options.storageDir);
            }
            output = await skill.execute({ taskId, objective: task.objective ?? task.capability, inputData: task.input, memory, mcp: client, mode: options.mode ?? 'live' });
          } else if ((id === 'ads' || id === 'analytics') && options.mode !== 'simulation') {
            output = await (await getAds()).call(task.capability, task.input);
          } else { output = await client.callTool(task.capability, task.input); }
          const status = output?.status ?? (output?.success === false ? 'FAILED' : 'COMPLETED');
          emit(taskId, status, task.capability);
          return { taskId, department: id, mode: options.mode ?? 'live', status, output };
        } catch (error) { emit(taskId, 'FAILED', task.capability); throw error; }
      })();
      active.add(work);
      try { return await work; } finally { active.delete(work); }
    },
    async resume(operationId: string) {
      if (closed) throw new Error(`Department ${id} is closed`);
      if (id !== 'ads' && id !== 'analytics') throw new Error('This department has no pending provider operations');
      return (await getAds()).resume(operationId);
    },
    async decide(operationId: string, approved: boolean) {
      if (closed) throw new Error(`Department ${id} is closed`);
      if (id !== 'ads' && id !== 'analytics') throw new Error('This department has no provider approvals');
      return (await getAds()).decide(operationId, approved);
    },
    async ownsOperation(operationId: string) {
      if (closed) throw new Error(`Department ${id} is closed`);
      if (id !== 'ads' && id !== 'analytics') return false;
      return (await getAds()).owns(operationId);
    },
    getActiveDepartments() { return [...children.keys()]; },
    async close() {
      closed = true;
      await Promise.allSettled([...active]);
      await Promise.all([...children.values()].map(child => child.close()));
      if (ads) (await ads).close();
    }
  };
}
