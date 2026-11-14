
export type ModuleId = 'ads';

export interface Capability {
  name: string;
  description?: string;
  kind: 'skill' | 'tool' | 'command';
  write?: boolean;
}

export interface ModuleCommand {
  capability: string;
  input?: Record<string, any>;
  objective?: string;
  taskId?: string;
}

export interface ModuleResult<T = unknown> {
  module: ModuleId;
  status: string;
  data: T;
}

export interface ModuleHealth {
  module: ModuleId;
  status: 'ready' | 'degraded';
  capabilities: number;
  details?: string[];
}

export interface MarketingModule {
  readonly id: ModuleId;
  listCapabilities(): Capability[];
  run(command: ModuleCommand): Promise<ModuleResult>;
  health(): Promise<ModuleHealth>;
  close(): Promise<void>;
}

