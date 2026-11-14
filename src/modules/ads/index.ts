import { createDepartment } from '../../departments/runtime.js';
import { adsTools } from './tools.js';
import { skillCatalog, toolDepartment } from '../../departments/catalog.js';
import type { DepartmentOptions } from '../../departments/runtime.js';
import type { Capability, MarketingModule, ModuleCommand, ModuleHealth, ModuleResult } from '../../core/modules/contracts.js';

const owners = new Set(['ads', 'analytics']);

export class AdsModule implements MarketingModule {
  readonly id = 'ads' as const;
  private ads;
  private analytics;

  constructor(options: DepartmentOptions = {}) {
    this.ads = createDepartment('ads', options);
    this.analytics = createDepartment('analytics', options);
  }

  listCapabilities(): Capability[] {
    const skills = Object.entries(skillCatalog)
      .filter(([, entry]) => owners.has(entry.department))
      .map(([name]) => ({ name, kind: 'skill' as const }));
    const tools = adsTools.map(tool => ({ name: tool.name, description: tool.description, kind: 'tool' as const, write: tool.write }));
    return [...skills, ...tools, ...['ads.operation.approve', 'ads.operation.reject', 'ads.operation.resume'].map(name => ({ name, kind: 'command' as const }))];
  }

  async run(command: ModuleCommand): Promise<ModuleResult> {
    const operationId = String(command.input?.operationId ?? '');
    if (command.capability === 'ads.operation.approve') return { module: this.id, status: 'AUTHORIZED', data: await this.decide(operationId, true) };
    if (command.capability === 'ads.operation.reject') return { module: this.id, status: 'REJECTED', data: await this.decide(operationId, false) };
    if (command.capability === 'ads.operation.resume') {
      const data: any = await this.resume(operationId);
      return { module: this.id, status: data?.status ?? 'COMPLETED', data };
    }
    const owner = skillCatalog[command.capability]?.department ?? toolDepartment(command.capability);
    if (!owner || !owners.has(owner)) throw new Error(`${command.capability} does not belong to ads`);
    const runtime = owner === 'analytics' ? this.analytics : this.ads;
    const result = await runtime.run({ capability: command.capability, input: command.input ?? {}, objective: command.objective, taskId: command.taskId });
    return { module: this.id, status: result.status, data: result.output };
  }

  async decide(operationId: string, approved: boolean): Promise<unknown> {
    const runtime = await this.analytics.ownsOperation(operationId) ? this.analytics : this.ads;
    return runtime.decide(operationId, approved);
  }

  async resume(operationId: string): Promise<unknown> {
    const runtime = await this.analytics.ownsOperation(operationId) ? this.analytics : this.ads;
    return runtime.resume(operationId);
  }

  async health(): Promise<ModuleHealth> {
    return { module: this.id, status: 'ready', capabilities: this.listCapabilities().length };
  }

  async close(): Promise<void> {
    await Promise.all([this.ads.close(), this.analytics.close()]);
  }
}
