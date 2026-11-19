// Lists every tool on a harness MCP server: node --env-file=.env scripts/list-tools.mjs ads|analytics
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const server = process.argv[2] ?? 'ads';
const client = new Client({ name: 'list-tools', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--env-file=.env', 'bin/mcp.js', server], stderr: 'ignore' }));
const { tools } = await client.listTools();
for (const t of tools) console.log(t.name + '\t' + (t.description ?? '').split('\n')[0].slice(0, 150));
await client.close();
