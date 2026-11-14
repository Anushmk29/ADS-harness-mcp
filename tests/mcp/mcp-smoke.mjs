import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: process.execPath, args: ['bin/mcp.js','ads','meta'], cwd: process.cwd(), stderr: 'pipe' });
const client = new Client({ name: 'local-smoke', version: '1' });
try {
  await client.connect(transport);
  const list = await client.listTools();
  assert(list.tools.some(t => t.name === 'meta_ads_create_campaign'));
  assert(!list.tools.some(t => t.name.startsWith('google_ads_')));
  assert(!list.tools.some(t => t.name === 'department_run'));
  const result = await client.callTool({ name: 'ads_compare_performance', arguments: {
    currency: 'INR', since: '2026-09-01', until: '2026-09-10',
    channels: [{ platform: 'meta', currency: 'INR', spend: 100, attributedRevenue: 300 }]
  } });
  assert(!result.isError);
  assert.equal(JSON.parse(result.content[0].text).status, 'COMPLETED');
  const outside = await client.callTool({ name: 'google_ads_list_accounts', arguments: {} });
  assert.equal(outside.isError, true);
  console.log(`MCP stdio smoke passed: ${list.tools.length} scoped tools, valid call, scope rejection; no credentials needed.`);
} finally { await client.close(); }
