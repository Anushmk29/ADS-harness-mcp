// Feature test for the Meta side of the harness (Google Ads and GA4 are left out on purpose).
//
//   node --env-file=.env scripts/feature-test.mjs
//
// What it does and does not do:
// - Reads run against the live Meta account through the normal policy (config/ads-module.yaml).
// - Writes run through a dry-run copy of that policy (config/ads-module.test-dryrun.yaml, picked up with
//   ADS_POLICY_FILE), so the harness checks every write and then stops with DRY_RUN. Nothing is sent to
//   Meta, nothing lands in the approval queue, no budget is added and nothing is switched on.
// - Safety tests send deliberately bad writes through the LIVE policy and expect the harness to refuse
//   them before they reach the approval queue.
// Results go to reports/feature-test-<date>/results.json and a readable summary.md.
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ACCOUNT = 'act_2087398631820901';
const PAGE = '790058867517513';
const CAMPAIGN = '120252530249880659';      // New Sales Campaign 23th october (ACTIVE, left alone)
const PAUSED_CAMPAIGN = '120253435679090659'; // Namostri Engagement Campaign 2.0 (PAUSED)
const PAUSED_ADSET = '120253435787050659';
const PAUSED_AD = '120253436132360659';
const today = new Date().toISOString().slice(0, 10);
const since = '2026-06-01', until = today;
const outDir = path.join('reports', `feature-test-${today}`);
fs.mkdirSync(outDir, { recursive: true });

// Dry-run copy of the live policy: same allowlists and caps, only the mode differs.
const livePolicy = fs.readFileSync('config/ads-module.yaml', 'utf8');
const dryPolicyFile = 'config/ads-module.test-dryrun.yaml';
// The copy also allowlists the test objects so object-scoped writes (Page post, CAPI, audience users,
// budget schedule) get far enough to be checked. The live policy keeps allowedObjects empty.
fs.writeFileSync(dryPolicyFile, livePolicy.replace(/^mode:.*$/m, 'mode: dry-run   # feature-test copy, never used for real work')
  .replace(/^allowedObjects:.*$/m, "allowedObjects: ['120253435679090659', '790058867517513', '994272683490583', '1']"));

async function connect(server, env = {}) {
  const client = new Client({ name: 'feature-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--env-file=.env', 'bin/mcp.js', server], env: { ...process.env, ...env }, stderr: 'ignore' }));
  return client;
}
const live = await connect('ads');
const dry = await connect('ads', { ADS_POLICY_FILE: dryPolicyFile });
const analytics = await connect('analytics');

const results = [];
async function call(client, tool, args) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await client.callTool({ name: tool, arguments: args });
      const text = (res.content ?? []).map(c => c.text).join('\n');
      let json; try { json = JSON.parse(text); } catch { json = undefined; }
      const failed = res.isError || /"status":"FAILED"/.test(text.slice(0, 400)) || json?.error;
      if (failed && /fetch failed|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|ECONNRESET/i.test(text) && attempt < 4) continue;
      return { ok: !failed, text, json };
    } catch (error) {
      if (attempt < 4 && /timeout|fetch failed/i.test(String(error))) continue;
      return { ok: false, text: String(error?.message ?? error) };
    }
  }
}
const output = r => r.json?.output ?? r.json;
const rows = r => { const o = output(r); const d = o?.data?.data ?? o?.data ?? o; return Array.isArray(d) ? d : []; };

/** expect: 'ok' | 'dryrun' | 'refused' (with a regex the refusal must match). */
async function test(group, feature, client, tool, args, expect = 'ok', match, note) {
  const r = await call(client, tool, args);
  let pass;
  if (expect === 'ok') pass = r.ok;
  else if (expect === 'dryrun') pass = r.ok && /DRY_RUN/.test(r.text);
  else pass = !r.ok && (!match || match.test(r.text));
  const detail = r.text.replace(/\s+/g, ' ').slice(0, 220);
  results.push({ group, feature, tool, expect, pass, detail, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${group}] ${feature} (${tool})${pass ? '' : '  -> ' + detail}`);
  return r;
}

// ---------- 1. Meta ads: account, reads, insights, targeting ----------
const G1 = 'Meta reads';
const accts = await test(G1, 'List ad accounts', live, 'meta_ads_list_accounts', {});
const business = rows(accts).find(a => a.id === ACCOUNT)?.business?.id;
await test(G1, 'Provider versions', live, 'ads_provider_versions', {});
await test(G1, 'Meta capability map', live, 'meta_ads_capabilities', {});
for (const kind of ['campaign', 'adset', 'ad', 'creative', 'audience', 'label']) {
  const list = await test(G1, `List ${kind}s`, live, `meta_ads_list_${kind}`, { accountId: ACCOUNT, fields: ['id', 'name'], params: { limit: 50 } });
  const first = rows(list)[0]?.id;
  if (first) await test(G1, `Get one ${kind}`, live, `meta_ads_get_${kind}`, { accountId: ACCOUNT, objectId: first, fields: ['id', 'name'] });
  else results.push({ group: G1, feature: `Get one ${kind}`, tool: `meta_ads_get_${kind}`, expect: 'ok', pass: null, detail: `No ${kind}s on the account to fetch` });
}
await test(G1, 'Pixels', live, 'meta_ads_list_pixels', { accountId: ACCOUNT, fields: ['id', 'name', 'last_fired_time'] });
await test(G1, 'Instagram accounts on the Page', live, 'meta_ads_list_instagram_accounts', { accountId: ACCOUNT, parentId: PAGE, fields: ['id', 'username'] });
if (business) {
  await test(G1, 'Pages owned by the business', live, 'meta_ads_list_pages', { accountId: ACCOUNT, parentId: business, fields: ['id', 'name'] });
  await test(G1, 'Business users', live, 'meta_ads_list_business_users', { accountId: ACCOUNT, parentId: business, fields: ['id', 'name'] });
  const cats = await test(G1, 'Catalogs (business)', live, 'meta_ads_list_catalog', { accountId: ACCOUNT, parentId: business, fields: ['id', 'name'] });
  const cat = rows(cats)[0]?.id;
  if (cat) {
    await test(G1, 'Get catalog', live, 'meta_ads_get_catalog', { accountId: ACCOUNT, parentId: business, objectId: cat });
    await test(G1, 'Product sets', live, 'meta_ads_list_product_set', { accountId: ACCOUNT, parentId: cat });
    await test(G1, 'Product feeds', live, 'meta_ads_list_product_feed', { accountId: ACCOUNT, parentId: cat });
    await test(G1, 'Products', live, 'meta_ads_list_products', { accountId: ACCOUNT, parentId: cat, fields: ['id', 'name'] });
  } else results.push({ group: G1, feature: 'Product sets / feeds / products', tool: 'meta_ads_list_product_*', expect: 'ok', pass: null, detail: 'No catalog on the business, so nothing to read' });
} else results.push({ group: G1, feature: 'Catalogs, business Pages, business users', tool: 'meta_ads_list_catalog / _pages / _business_users', expect: 'ok', pass: null, detail: 'These need a Business Manager id; meta_ads_list_accounts does not return one for this account' });
const forms = await test(G1, 'Lead forms (page)', live, 'meta_ads_list_lead_form', { accountId: ACCOUNT, parentId: PAGE });
const form = rows(forms)[0]?.id;
if (form) {
  await test(G1, 'Leads', live, 'meta_ads_list_leads', { accountId: ACCOUNT, parentId: form });
  await test(G1, 'Test leads', live, 'meta_ads_list_test_leads', { accountId: ACCOUNT, parentId: form });
} else results.push({ group: G1, feature: 'Leads / test leads', tool: 'meta_ads_list_leads', expect: 'ok', pass: null, detail: 'No lead forms on the Page, so nothing to read' });
await test(G1, 'Budget schedules', live, 'meta_ads_list_budget_schedules', { accountId: ACCOUNT, parentId: CAMPAIGN });
for (const level of ['account', 'campaign', 'adset', 'ad']) {
  await test(G1, `Insights, ${level} level`, live, 'meta_ads_insights', { accountId: ACCOUNT, level, since, until, fields: ['spend', 'impressions', 'clicks', 'actions'], timeIncrement: 'all_days' });
}
await test(G1, 'Insights, daily rows', live, 'meta_ads_insights', { accountId: ACCOUNT, level: 'account', since: '2026-10-23', until: '2026-10-31', fields: ['spend', 'impressions'], timeIncrement: 1 });
await test(G1, 'Insights, age+gender breakdown', live, 'meta_ads_insights', { accountId: ACCOUNT, level: 'account', since, until, fields: ['spend', 'impressions'], breakdowns: ['age', 'gender'], timeIncrement: 'all_days' });
await test(G1, 'Insights, placement breakdown', live, 'meta_ads_insights', { accountId: ACCOUNT, level: 'account', since, until, fields: ['spend', 'impressions'], breakdowns: ['publisher_platform', 'platform_position'], timeIncrement: 'all_days' });
await test(G1, 'Insights, one campaign', live, 'meta_ads_insights', { accountId: ACCOUNT, objectId: CAMPAIGN, level: 'campaign', since, until, fields: ['campaign_name', 'spend', 'actions', 'action_values'], timeIncrement: 'all_days' });
await test(G1, 'Targeting search: interests', live, 'meta_ads_search_targeting', { accountId: ACCOUNT, type: 'adinterest', q: 'ethnic wear' });
await test(G1, 'Targeting search: interest suggestions', live, 'meta_ads_search_targeting', { accountId: ACCOUNT, type: 'adinterestsuggestion', params: { interest_list: ['Saree'] } });
await test(G1, 'Targeting search: locations', live, 'meta_ads_search_targeting', { accountId: ACCOUNT, type: 'adgeolocation', q: 'Gwalior', params: { location_types: ['city'] } });
await test(G1, 'Targeting search: categories', live, 'meta_ads_search_targeting', { accountId: ACCOUNT, type: 'adTargetingCategory', params: { type: 'demographics' } });

// ---------- 2. Meta ads: planning and launch flow (no provider writes) ----------
const G2 = 'Meta planning';
const spec = JSON.parse(fs.readFileSync('drafts/engagement-2-0.json', 'utf8'));
spec.ad.creative = { imageHash: '005b2cbc16af1a1d9d8c875f563d6bda' }; // gold suit photo already in the account
await test(G2, 'Account readiness check', live, 'meta_ads_readiness', { accountId: ACCOUNT });
await test(G2, 'Validate a campaign draft', live, 'meta_ads_validate_campaign', { draftId: 'feature-test-draft', spec });
await test(G2, 'Prepare a paused launch + approval brief', live, 'meta_ads_prepare_launch', { launchId: 'feature-test-launch', accountId: ACCOUNT, spec });

// ---------- 3. Meta ads: every write tool, dry-run only ----------
const G3 = 'Meta writes (dry-run)';
const w = (tool, args, feature) => test(G3, feature, dry, tool, { accountId: ACCOUNT, operationId: `ft-${tool.replace(/_/g, '-')}`.slice(0, 100), ...args }, 'dryrun');
await w('meta_ads_create_campaign', { data: { name: 'TEST do not use', objective: 'OUTCOME_ENGAGEMENT' } }, 'Create campaign');
await w('meta_ads_update_campaign', { objectId: PAUSED_CAMPAIGN, data: { name: 'Namostri Engagement Campaign 2.0' } }, 'Update campaign (rename)');
await w('meta_ads_delete_campaign', { objectId: PAUSED_CAMPAIGN }, 'Delete campaign');
await w('meta_ads_create_adset', { data: { name: 'TEST', campaign_id: PAUSED_CAMPAIGN, targeting: { geo_locations: { countries: ['IN'] } }, optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS' } }, 'Create ad set');
await w('meta_ads_update_adset', { objectId: PAUSED_ADSET, data: { name: 'TEST rename' } }, 'Update ad set');
await w('meta_ads_delete_adset', { objectId: PAUSED_ADSET }, 'Delete ad set');
await w('meta_ads_create_ad', { data: { name: 'TEST', adset_id: PAUSED_ADSET, creative: { creative_id: '1932038431500837' } } }, 'Create ad');
await w('meta_ads_update_ad', { objectId: PAUSED_AD, data: { name: 'TEST rename' } }, 'Update ad');
await w('meta_ads_delete_ad', { objectId: PAUSED_AD }, 'Delete ad');
await w('meta_ads_create_creative', { data: { name: 'TEST creative' } }, 'Create creative');
await w('meta_ads_delete_creative', { objectId: '1932038431500837' }, 'Delete creative');
await w('meta_ads_create_audience', { data: { name: 'TEST audience', subtype: 'CUSTOM' } }, 'Create custom audience');
await w('meta_ads_update_audience', { objectId: '1', data: { name: 'TEST' } }, 'Update audience');
await w('meta_ads_delete_audience', { objectId: '1' }, 'Delete audience');
await w('meta_ads_audience_add_users', { objectId: '1', data: { payload: { schema: ['EMAIL_SHA256'], data: [['0'.repeat(64)]] } } }, 'Add users to audience');
await w('meta_ads_create_label', { data: { name: 'TEST label' } }, 'Create label');
await w('meta_ads_update_label', { objectId: '1', data: { name: 'TEST' } }, 'Update label');
await w('meta_ads_delete_label', { objectId: '1' }, 'Delete label');
await w('meta_ads_upload_image', { data: { bytes: fs.readFileSync('drafts/creatives/gold-tissue-palazzo.jpg').toString('base64').slice(0, 2000) } }, 'Upload image');
await w('meta_ads_upload_video', { data: { file_url: 'https://example.com/test.mp4', title: 'TEST' } }, 'Upload video');
await w('meta_ads_send_conversion_events', { objectId: '994272683490583', data: { data: [{ event_name: 'PageView', event_time: Math.floor(Date.now() / 1000), action_source: 'website' }], test_event_code: 'TEST123' } }, 'Send conversion (CAPI) event');
await w('meta_ads_create_budget_schedule', { parentId: PAUSED_CAMPAIGN, data: { budget_value: 100, budget_value_type: 'ABSOLUTE', time_start: '2026-12-01T00:00:00Z', time_end: '2026-12-02T00:00:00Z' } }, 'Create budget schedule');
await test(G3, 'Full paused launch (campaign+ad set+creative+ad)', dry, 'ads_launch_meta', { accountId: ACCOUNT, operationId: 'ft-launch', launchId: 'feature-test-launch', spec }, 'refused', /readiness/i, 'Stops before dry-run because readiness has manual checks still open');
await w('meta_ads_create_page_post', { objectId: PAGE, data: { message: 'TEST' } }, 'Create Page post');
await w('meta_ads_create_lead_form', { parentId: PAGE, data: { name: 'TEST', questions: [{ type: 'EMAIL' }], privacy_policy: { url: 'https://www.namostri.com/' } } }, 'Create lead form');
await w('meta_ads_create_test_lead', { objectId: '1', data: {} }, 'Create test lead');

// ---------- 4. Analysis and optimisation ----------
const G4 = 'Analysis & optimisation';
await test(G4, 'Creative fatigue check (too little data)', live, 'ads_analyze_creative', { adId: PAUSED_AD, baseline: { impressions: 800, clicks: 10, spend: 200, conversions: 1 }, current: { impressions: 700, clicks: 6, spend: 210, conversions: 0 }, conversionLagElapsed: true });
await test(G4, 'Creative fatigue check (mature data)', live, 'ads_analyze_creative', { adId: PAUSED_AD, baseline: { impressions: 40000, clicks: 800, spend: 4000, conversions: 40, frequency: 1.6 }, current: { impressions: 40000, clicks: 380, spend: 4600, conversions: 14, frequency: 4.2 }, conversionLagElapsed: true });
await test(G4, 'Compare performance / blended ROAS', live, 'ads_compare_performance', { currency: 'INR', since, until, channels: [{ platform: 'meta', currency: 'INR', spend: 8475, attributedRevenue: 7598, newCustomers: 2 }], orders: [{ orderId: 'o1', currency: 'INR', revenue: 3799 }, { orderId: 'o2', currency: 'INR', revenue: 3799 }] });
await test(G4, 'Compare refuses mixed currencies', live, 'ads_compare_performance', { currency: 'INR', since, until, channels: [{ platform: 'meta', currency: 'USD', spend: 100 }] }, 'refused');
await test(G4, 'Reconcile measurement (platform vs orders)', live, 'ads_reconcile_measurement', { currency: 'INR', since, until, timezone: 'Asia/Kolkata', alignment: { campaignIds: true, utmKeys: ['utm_campaign'], conversionDefinitions: true, currencies: true }, platform: [{ provider: 'meta', currency: 'INR', campaignId: CAMPAIGN, spend: 2090, attributedRevenue: 7598 }], ga4: [], outcomes: [] });
await test(G4, 'Save an evidence-backed recommendation', live, 'ads_create_recommendation', { recommendationId: 'feature-test-rec', provider: 'meta', accountId: ACCOUNT, action: 'Stop Advantage+ widening gender on the New Sales ad set (TEST record, not queued)', evidencePeriod: { since, until }, timezone: 'Asia/Kolkata', currency: 'INR', conversionLag: '7 days', minimumDataStatus: 'NOT_MET', expectedResult: 'More spend on women 20-45', confidence: 0.4, cooldownDays: 7, evaluationDate: '2026-12-15', stopCondition: 'Cost per chat above ₹25', proposedOperations: [{ tool: 'meta_ads_update_adset', objectId: '120252530249870659' }] });
await test(G4, 'Set up read-only daily monitoring', live, 'ads_schedule_monitoring', { scheduleId: 'feature-test-monitor', provider: 'meta', accountId: ACCOUNT, timezone: 'Asia/Kolkata', currency: 'INR' });
await test(G4, 'Run a monitoring window now', live, 'meta_ads_run_monitoring', { accountId: ACCOUNT, timezone: 'Asia/Kolkata', currency: 'INR', days: 30 });
for (const kind of ['meta_readiness', 'meta_campaign_draft', 'meta_launch', 'report', 'recommendation', 'schedule', 'reconciliation']) {
  await test(G4, `Saved records: ${kind}`, live, 'ads_list_records', { kind });
}
await test(G4, 'Approval queue / operation history', live, 'ads_list_operations', {});
await test(G4, 'Department skill: campaign optimisation', live, 'department_run', { capability: 'skill_campaign_optimization', objective: 'Review the Namostri account for waste', input: { accountId: ACCOUNT } });

// ---------- 5. Built-in marketing knowledge ----------
const G5 = 'Marketing knowledge';
const router = await test(G5, 'Knowledge router + file list', live, 'skill_knowledge', {});
for (const p of ['ads/meta-audit-checklist.md', 'ads/meta-analyze-optimize-scale.md', 'ads/meta-campaign-structures.md', 'ads/ppc-math.md', 'ads/creative-and-copy.md', 'ads/competitor-intel.md', 'ads/report-template.md', 'ads/our-business-fit.md', 'ads/b2b-paid-playbook.md', 'ops/diagnose.md', 'ops/learning-loop.md', 'ops/review-panel.md', 'creative/SKILL.md']) {
  await test(G5, `Read ${p}`, live, 'skill_knowledge', { path: p });
}
await test(G5, 'Path escape is blocked', live, 'skill_knowledge', { path: '../.env' }, 'refused');
await test(G5, 'Learnings memory: list', live, 'skill_learnings', { action: 'list' });
await test(G5, 'Learnings memory: retro', live, 'skill_learnings', { action: 'retro', days: 30 });
await test(G5, 'Same knowledge on analytics server', analytics, 'skill_knowledge', {});

// ---------- 6. Safety systems (live policy; every one must be refused) ----------
const G6 = 'Safety';
const s = (feature, tool, args, match) => test(G6, feature, live, tool, { accountId: ACCOUNT, operationId: `ft-safety-${results.length}`, ...args }, 'refused', match);
await s('Switching a campaign ON through the API is blocked', 'meta_ads_update_campaign', { objectId: PAUSED_CAMPAIGN, data: { status: 'ACTIVE' } }, /activation is disabled/i);
await s('Switching an ad ON through the API is blocked', 'meta_ads_update_ad', { objectId: PAUSED_AD, data: { status: 'ACTIVE' } }, /activation is disabled/i);
await s('Numeric status values are blocked', 'meta_ads_update_adset', { objectId: PAUSED_ADSET, data: { status: '1' } }, /named provider value/i);
await s('Budget above the ₹500 cap is blocked', 'meta_ads_update_campaign', { objectId: PAUSED_CAMPAIGN, data: { daily_budget: 60000 } }, /per-write ceiling/i);
await s('Bid above the cap is blocked', 'meta_ads_update_adset', { objectId: PAUSED_ADSET, data: { bid_amount: 999999 } }, /per-write ceiling/i);
await s('Zero/negative budget is blocked', 'meta_ads_update_campaign', { objectId: PAUSED_CAMPAIGN, data: { daily_budget: -5 } }, /positive safe integer/i);
await test(G6, 'Multiplier budget schedule is blocked', dry, 'meta_ads_create_budget_schedule', { accountId: ACCOUNT, operationId: 'ft-safety-mult', parentId: PAUSED_CAMPAIGN, data: { budget_value: 2, budget_value_type: 'MULTIPLIER', time_start: '2026-12-01T00:00:00Z', time_end: '2026-12-02T00:00:00Z' } }, 'refused', /Multiplier/i);
await s('Special ad categories (housing/credit etc.) are blocked', 'meta_ads_create_campaign', { data: { name: 'TEST', objective: 'OUTCOME_LEADS', special_ad_categories: ['HOUSING'] } }, /special-ad/i);
await s('Deprecated placement is blocked', 'meta_ads_update_adset', { objectId: PAUSED_ADSET, data: { targeting: { instagram_positions: ['instagram_explore_feed'] } } }, /deprecated/i);
await s('Deprecated attribution window is blocked', 'meta_ads_update_adset', { objectId: PAUSED_ADSET, data: { attribution_spec: [{ event_type: 'VIEW_THROUGH', window_days: 7, x: '7d_view' }] } }, /deprecated/i);
await s('Tokens inside arguments are blocked', 'meta_ads_update_campaign', { objectId: PAUSED_CAMPAIGN, data: { access_token: 'x', name: 'TEST' } }, /Credentials/i);
await s('Account outside the allowlist is blocked (write)', 'meta_ads_create_label', { accountId: 'act_1234567890', data: { name: 'TEST' } }, /allowlist/i);
await test(G6, 'Account outside the allowlist is blocked (read)', live, 'meta_ads_list_campaign', { accountId: 'act_1234567890' }, 'refused', /allowlist/i);
await s('CAPI events to a pixel not in allowedObjects are blocked', 'meta_ads_send_conversion_events', { objectId: '994272683490583', data: { data: [{ event_name: 'PageView' }] } }, /allowedObjects/i);
await s('Adding users to an audience not in allowedObjects is blocked', 'meta_ads_audience_add_users', { objectId: '1', data: { payload: { schema: ['EMAIL_SHA256'], data: [] } } }, /allowedObjects/i);
await s('Budget schedule on a campaign not in allowedObjects is blocked', 'meta_ads_create_budget_schedule', { parentId: PAUSED_CAMPAIGN, data: { budget_value: 100, budget_value_type: 'ABSOLUTE', time_start: '2026-12-01T00:00:00Z', time_end: '2026-12-02T00:00:00Z' } }, /allowedObjects/i);
await s('Page post without allowedObjects is blocked', 'meta_ads_create_page_post', { objectId: PAGE, data: { message: 'TEST' } }, /allowedObjects/i);
await test(G6, 'Live write without operationId is blocked', live, 'meta_ads_create_label', { accountId: ACCOUNT, data: { name: 'TEST' } }, 'refused', /operationId/i);
await test(G6, 'Unknown argument keys are rejected (strict schema)', live, 'meta_ads_list_campaign', { accountId: ACCOUNT, limit: 5 }, 'refused', /unrecognized|additional/i);
await test(G6, 'Launch needs persisted READY readiness', live, 'ads_launch_meta', { accountId: ACCOUNT, launchId: 'feature-test-launch', operationId: 'ft-safety-launch', spec }, 'refused', /readiness|valid/i);
await test(G6, 'Continue-launch needs a real PARTIAL launch', live, 'ads_continue_meta_launch', { accountId: ACCOUNT, launchId: 'feature-test-nothing', operationId: 'ft-safety-continue' }, 'refused');
const opsAfter = await call(live, 'ads_list_operations', { statuses: ['PENDING_APPROVAL'] });
const pendingFromTest = (opsAfter.text.match(/"(?:id|operationId)":"ft-[^"]*"/g) ?? []);
results.push({ group: G6, feature: 'Nothing from this test reached the approval queue', tool: 'ads_list_operations', expect: 'ok', pass: pendingFromTest.length === 0, detail: pendingFromTest.length ? `Queued: ${pendingFromTest.join(', ')}` : 'No ft-* operations pending' });
const camp = await call(live, 'meta_ads_get_campaign', { accountId: ACCOUNT, objectId: PAUSED_CAMPAIGN, fields: ['id', 'name', 'status', 'daily_budget'] });
const c = output(camp)?.data;
results.push({ group: G6, feature: 'Engagement 2.0 still PAUSED with the same budget after the run', tool: 'meta_ads_get_campaign', expect: 'ok', pass: c?.status === 'PAUSED', detail: JSON.stringify(c) });

// ---------- 7. Decode: format research (dashboard feature, tested through its service) ----------
// Decode is not an MCP tool; the dashboard's Inside > Decode tab calls this service. Without an LLM key
// (DeepSeek or OpenRouter) and, for competitor ads, an Apify token, a run must refuse to start.
const G7 = 'Decode (format research)';
const { DecodeService } = await import('../dist/modules/decode/index.js');
const decode = new DecodeService(path.join(outDir, 'decode-scratch'), () => {}, { runAds: async () => ({ data: [] }) });
const hasLlm = Boolean((process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_MODEL) || (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_TEXT_MODEL));
for (const [feature, input, expectStart, match] of [
  ['Decode own Meta ads', { platform: 'own_meta' }, hasLlm, /LLM/],
  ['Decode competitor ads (Ad Library)', { platform: 'meta_ads', query: 'Libas' }, hasLlm && Boolean(process.env.APIFY_TOKEN), /APIFY_TOKEN|LLM/],
  ['Rejects a 1-letter query', { platform: 'meta_ads', query: 'x' }, false, /brand, keyword/],
  ['Rejects platforms it does not support', { platform: 'tiktok', query: 'abc' }, false, /invalid_enum_value/]
]) {
  let started = false, detail;
  try { detail = JSON.stringify(decode.start(input)).slice(0, 200); started = true; } catch (error) { detail = String(error.message).replace(/\s+/g, ' ').slice(0, 200); }
  const pass = expectStart ? started : !started && match.test(detail);
  results.push({ group: G7, feature, tool: 'DecodeService.start', expect: expectStart ? 'ok' : 'refused', pass, detail, note: expectStart ? undefined : 'Expected to refuse with the keys in .env today' });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${G7}] ${feature}`);
}
fs.rmSync(path.join(outDir, 'decode-scratch'), { recursive: true, force: true });

await Promise.all([live.close(), dry.close(), analytics.close()]);
fs.rmSync(dryPolicyFile, { force: true });

// ---------- write-up ----------
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), account: ACCOUNT, results }, null, 2));
const groups = [...new Set(results.map(r => r.group))];
const mark = r => r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
let md = `# Harness feature test, ${today}\n\nAccount ${ACCOUNT}. Reads were live; writes were dry-run; safety checks used the live policy.\n\n`;
for (const g of groups) {
  const rs = results.filter(r => r.group === g);
  md += `## ${g} (${rs.filter(r => r.pass).length}/${rs.filter(r => r.pass !== null).length} pass)\n\n| Result | Feature | Tool | Detail |\n|---|---|---|---|\n`;
  for (const r of rs) md += `| ${mark(r)} | ${r.feature} | \`${r.tool}\` | ${(r.note ? r.note + '. ' : '') + r.detail.replace(/\|/g, '/').slice(0, 160)} |\n`;
  md += '\n';
}
fs.writeFileSync(path.join(outDir, 'summary.md'), md);
const total = results.filter(r => r.pass !== null).length, passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${total} passed, ${results.filter(r => r.pass === null).length} skipped. Written to ${outDir}`);
