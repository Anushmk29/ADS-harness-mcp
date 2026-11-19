// Calls one harness MCP tool: node --env-file=.env scripts/call-tool.mjs <tool> <args.json>
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const [tool, file] = process.argv.slice(2);
const client = new Client({ name: 'call-tool', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--env-file=.env', 'bin/mcp.js', 'ads'], stderr: 'ignore' }));
const res = await client.callTool({ name: tool, arguments: JSON.parse(readFileSync(file, 'utf8')) });
console.log((res.content ?? []).map(c => c.text).join('\n'));
await client.close();
