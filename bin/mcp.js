#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createDepartment } from '../dist/departments/runtime.js';
import { departmentIds, skillCatalog } from '../dist/departments/catalog.js';
import { TrackingStore } from '../dist/core/tracking/store.js';
import { dataDir } from '../dist/config/paths.js';

process.env.MARKETING_LOG_STDERR = '1';
const department = process.argv[2] ?? 'ads';
const platform = process.argv[3];
if (!departmentIds.includes(department)) throw new Error('Unknown department');
if (platform && !['meta','google','ga4'].includes(platform)) throw new Error('Platform must be meta, google, or ga4');
const runtime = createDepartment(department);
const server = new Server({ name: `marketing-${department}`, version: '1.1.0' }, { capabilities: { tools: {} } });
const catalogue = (await runtime.listTools()).filter(tool => !platform || tool.platform === platform);
const shared = await Promise.all(Object.entries(skillCatalog).filter(([, entry]) => entry.shared).map(async ([name, entry]) => {
  const skill = await entry.load();
  return { name, description: skill.description, parameters: skill.inputSchema ?? { type: 'object' } };
}));
catalogue.unshift(...shared);
const names = new Set(catalogue.map(tool => tool.name));
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  ...catalogue.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters })),
  { name: 'department_capabilities', description: 'Discover department workflow capabilities', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  ...(!platform ? [{ name: 'department_run', description: 'Run a department skill by its exact discovered capability ID', inputSchema: { type: 'object', properties: { capability: { type: 'string' }, input: { type: 'object' }, objective: { type: 'string' } }, required: ['capability'], additionalProperties: false } }] : [])
] }));
// Every call is recorded for the dashboard's Agent activity view; MCP_CLIENT_LABEL overrides the client's own name.
let tracking;
try { tracking = new TrackingStore(dataDir('tracking')); } catch { /* call log unavailable; tools still work */ }
const record = (request, started, ok, output, error) => {
  try {
    const args = request.params.arguments ?? {};
    tracking?.logToolCall({
      client: process.env.MCP_CLIENT_LABEL || server.getClientVersion()?.name || 'mcp-client',
      tool: request.params.name === 'department_run' ? `department_run:${args.capability ?? '?'}` : request.params.name,
      args, ok, durationMs: Date.now() - started, output, error
    });
  } catch { /* never fail a tool call because logging failed */ }
};
server.setRequestHandler(CallToolRequestSchema, async request => {
  const started = Date.now();
  try {
    let result;
    if (request.params.name === 'department_capabilities') result = platform ? [] : runtime.listCapabilities();
    else if (request.params.name === 'department_run') {
      if (platform) throw new Error('Cross-platform skills are not exposed by a platform-scoped server');
      if (!runtime.listCapabilities().some(c => c.name === request.params.arguments?.capability)) throw new Error('Use a discovered skill capability');
      result = await runtime.run(request.params.arguments);
    } else {
      if (!names.has(request.params.name)) throw new Error('Tool is outside this server scope');
      result = await runtime.run({ capability: request.params.name, input: request.params.arguments ?? {} });
    }
    // A department result can report failure without throwing.
    const failed = result?.status === 'FAILED';
    record(request, started, !failed, result, failed ? String(result.error ?? 'failed') : undefined);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) { record(request, started, false, undefined, error.message); return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
const close = async () => { await runtime.close(); await server.close(); tracking?.close(); };
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
process.stdin.on('end', () => void close());
await server.connect(new StdioServerTransport());
