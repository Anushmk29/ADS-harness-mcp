import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaMcpClient, MetaMcpToolError } from '../../src/modules/ads/meta-mcp/client.js';

const { clients } = vi.hoisted(() => ({ clients: [] as any[] }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: class {
  connect = vi.fn(async () => {});
  close = vi.fn(async () => { this.onclose?.(); });
  callTool = vi.fn(async () => ({ structuredContent: { ok: true } }));
  onclose?: () => void;
  constructor() { clients.push(this); }
} }));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: class {} }));
beforeEach(() => { clients.length = 0; });

describe('Meta MCP session recovery', () => {
  it('reconnects with a fresh token after a failed request without replaying the write', async () => {
    const token = vi.fn(async () => 'token');
    const mcp = new MetaMcpClient(token);
    try {
      await mcp.callTool('read', {});
      clients[0].callTool.mockRejectedValueOnce(new Error('timeout'));
      await expect(mcp.callTool('write', {})).rejects.toThrow('timeout');
      expect(clients[0].callTool).toHaveBeenCalledTimes(2);
      expect(clients[0].close).toHaveBeenCalledOnce();
      expect(await mcp.callTool('read', {})).toEqual({ ok: true });
      expect(token).toHaveBeenCalledTimes(2);
      expect(clients).toHaveLength(2);
    } finally { await mcp.close(); }
  });

  it('reconnects after a remote close, but keeps a healthy session on tool rejection', async () => {
    const mcp = new MetaMcpClient(async () => 'token');
    try {
      await mcp.callTool('read', {});
      clients[0].callTool.mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: 'denied' }] });
      await expect(mcp.callTool('read', {})).rejects.toBeInstanceOf(MetaMcpToolError);
      expect(clients[0].close).not.toHaveBeenCalled();
      clients[0].onclose();
      await mcp.callTool('read', {});
      expect(clients).toHaveLength(2);
    } finally { await mcp.close(); }
  });
});
