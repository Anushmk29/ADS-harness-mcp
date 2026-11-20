// MCP client for Meta's Ads MCP server. Programmatic access uses a bearer user token (no OAuth click-through),
// so the harness can call it unattended with the same ADS_DIRECT_META_ACCESS_TOKEN as the Graph API path.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface MetaMcpSnapshot {
  source: 'docs' | 'live';
  fetchedAt: string;
  tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
}

/** What AdsTransport needs; tests inject a fake. */
export interface MetaMcpCaller {
  callTool(name: string, args: Record<string, unknown>): Promise<any>;
}

/** Meta answered with isError: a definite rejection, safe to mark FAILED rather than UNCERTAIN. */
export class MetaMcpToolError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'MetaMcpToolError'; }
}

export const META_MCP_URL = 'https://mcp.facebook.com/ads';

export class MetaMcpClient implements MetaMcpCaller {
  private connection?: Promise<Client>;
  constructor(private token: () => Promise<string>, private url = process.env.ADS_META_MCP_URL || META_MCP_URL) {}

  private connect(): Promise<Client> {
    if (this.connection) return this.connection;
    const pending = (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(this.url), { requestInit: { headers: { Authorization: `Bearer ${await this.token()}` } } });
      const client = new Client({ name: 'marketing-harness', version: '1.0.0' });
      client.onclose = () => { if (this.connection === pending) this.connection = undefined; };
      try { await client.connect(transport, { timeout: 60_000 }); }
      catch (error) { await client.close().catch(() => {}); throw error; }
      return client;
    })().catch(error => { if (this.connection === pending) this.connection = undefined; throw error; });
    this.connection = pending;
    return pending;
  }

  private async request<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const pending = this.connect();
    const client = await pending;
    try { return await run(client); }
    catch (error) {
      // Discard a broken session; the transport decides whether a read can be retried.
      if (this.connection === pending) this.connection = undefined;
      await client.close().catch(() => {});
      throw error;
    }
  }

  async listTools(): Promise<MetaMcpSnapshot['tools']> {
    const tools: MetaMcpSnapshot['tools'] = [];
    let cursor: string | undefined;
    do {
      const page = await this.request(client => client.listTools(cursor ? { cursor } : undefined, { timeout: 60_000 }));
      tools.push(...page.tools.map(t => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema as Record<string, unknown> })));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    const result: any = await this.request(client => client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 }));
    const text = (result.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    if (result.isError) throw new MetaMcpToolError(`Meta MCP ${name}: ${text || 'tool error'}`);
    if (result.structuredContent !== undefined) return result.structuredContent;
    try { return JSON.parse(text); } catch { return text; }
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    if (connection) await (await connection.catch(() => undefined))?.close();
  }
}
