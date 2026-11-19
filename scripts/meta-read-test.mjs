// Read-only Meta check. Calls only list/insights tools; never creates, edits or pauses anything.
// Run from the harness folder:  node --env-file=.env scripts/meta-read-test.mjs [act_123...]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

if (!process.env.ADS_DIRECT_META_ACCESS_TOKEN) {
  console.error('ADS_DIRECT_META_ACCESS_TOKEN is empty in .env. Paste the token there, save, and rerun.');
  process.exit(1);
}

const transport = new StdioClientTransport({ command: process.execPath, args: ['--env-file=.env', 'bin/mcp.js', 'ads'], stderr: 'ignore' });
const client = new Client({ name: 'meta-read-test', version: '1.0.0' });
await client.connect(transport);

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content ?? []).map((c) => c.text ?? '').join('\n');
  return { ok: !res.isError, text };
};
const show = (label, r) => console.log(`\n== ${label}: ${r.ok ? 'OK' : 'FAILED'} ==\n${r.text.slice(0, 2500)}`);

const accounts = await call('meta_ads_list_accounts');
show('Ad accounts this token can see', accounts);

let accountId = process.argv[2];
if (!accountId) accountId = accounts.text.match(/act_\d+/)?.[0];
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const range = { since: day(7), until: day(1), timeIncrement: 'all_days' };
if (accounts.ok && accountId) {
  show(`Last 7 days, account ${accountId}`, await call('meta_ads_insights', { accountId, level: 'account', ...range, fields: ['spend','impressions','clicks','ctr','cpc','actions'] }));
  show(`Campaigns, last 7 days, ${accountId}`, await call('meta_ads_insights', { accountId, level: 'campaign', ...range, fields: ['campaign_name','spend','impressions','clicks','actions'] }));
}
await client.close();
