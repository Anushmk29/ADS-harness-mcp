export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: any) => Promise<any>;
}

export interface MCPServerInfo {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  tools: Map<string, MCPToolDefinition>;
}

export class MCPClient {
  private servers: Map<string, MCPServerInfo> = new Map();

  private loading = new Map<string, Promise<void>>();
  public constructor(private loader?: (name: string, client: MCPClient) => Promise<void>, private visualize = true) {}

  public setLoader(loader: (name: string, client: MCPClient) => Promise<void>): void {
    if (this.loading.size) throw new Error('Cannot switch providers while tools are loading');
    this.servers.clear();
    this.loader = loader;
  }

  public registerServer(server: {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
  }): void {
    this.servers.set(server.id, {
      ...server,
      tools: new Map()
    });
  }

  public registerTool(serverId: string, tool: MCPToolDefinition): void {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`MCP Server "${serverId}" not registered.`);
    }
    server.tools.set(tool.name, tool);
  }

  public async callTool(toolName: string, args: any): Promise<any> {
    if (!this.hasTool(toolName) && this.loader) {
      let pending = this.loading.get(toolName);
      if (!pending) {
        pending = this.loader(toolName, this);
        this.loading.set(toolName, pending);
      }
      try { await pending; } finally { this.loading.delete(toolName); }
    }
    for (const server of this.servers.values()) {
      const tool = server.tools.get(toolName);
      if (tool) {
        try { if (this.visualize) {
          const { VisualizationEventBus } = await import('../visualization/event-bus.js');
          VisualizationEventBus.getInstance().emitEvent({
            type: 'AGENT_STATE_CHANGED',
            agentId: server.id.replace(/-/g, '_') + '_agent',
            department: server.id,
            status: 'EXECUTING',
            subtask: `Calling MCP Tool: ${toolName}`,
            tool: `${server.id} → ${toolName}`,
            timestamp: Date.now()
          }); }
        } catch {
          // Non-blocking visualization hook
        }
        return await tool.handler(args);
      }
    }
    throw new Error(`MCP Tool "${toolName}" not found in any registered server.`);
  }

  public hasTool(toolName: string): boolean {
    for (const server of this.servers.values()) {
      if (server.tools.has(toolName)) return true;
    }
    return false;
  }

  public listTools(): Array<{ serverId: string; name: string; description: string; parameters: any }> {
    const result: Array<{ serverId: string; name: string; description: string; parameters: any }> = [];
    for (const server of this.servers.values()) {
      for (const tool of server.tools.values()) {
        result.push({
          serverId: server.id,
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        });
      }
    }
    return result;
  }
}
