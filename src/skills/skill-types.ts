import { MemoryManager } from '../memory/memory-manager.js';
import { MCPClient } from '../mcp/mcp-client.js';

export interface SkillExecutionContext {
  taskId: string;
  objective: string;
  inputData: Record<string, any>;
  memory: MemoryManager;
  mcp: MCPClient;
  /** 'live' = real providers and LLM writing; anything else may use placeholders. Set by the department runtime. */
  mode?: 'live' | 'simulation';
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  /** JSON Schema for inputData, shown to models that call the skill as a tool. */
  inputSchema?: Record<string, unknown>;
  execute: (ctx: SkillExecutionContext) => Promise<any>;
}
