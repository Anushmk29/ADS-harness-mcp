#!/usr/bin/env node

import { initializeMarketingHarness, VisualizationServer, AdsConfigLoader, TokenStore, runDoctor, formatChecks, backupDataDir } from '../dist/index.js';
import { runIncreaseQualifiedLeadsMission } from '../dist/workflows/missions/increase-qualified-leads.js';
import { runDueJobs } from '../dist/workflows/daily-loop.js';

const args = process.argv.slice(2);
const command = args[0] || 'status';

const harness = initializeMarketingHarness();

async function main() {
  console.log('\n=============================================================');
  console.log('🤖 DEEPSEEK HARNESS - AUTONOMOUS MARKETING OPERATING SYSTEM');
  console.log('=============================================================\n');

  switch (command) {
    case 'status': {
      const { facts: biz, personas, rules, learnings } = harness.memory.summary();

      console.log('🏢 BUSINESS BRAIN:');
      console.log(`   - Business: ${biz.business_name || 'ApexScale AI'} (${biz.industry})`);
      console.log(`   - Website: ${biz.website}`);
      console.log(`   - Current CAC: $${biz.current_cac} | Target CAC: $${biz.target_cac}`);
      console.log(`   - Personas Configured: ${personas.length} (${personas[0]?.title})`);

      console.log('\n🧠 LEARNING & MEMORY REPOSITORY:');
      console.log(`   - Active Learned Feedback Rules: ${rules.length}`);
      console.log(`   - Recorded Learnings (emerging+): ${learnings.length}`);

      console.log('\n🛠️ CAPABILITIES & TOOLS:');
      console.log(`   - Department Capabilities: ${harness.departments.listCapabilities().length}`);
      console.log(`   - Registered MCP Tools: ${harness.mcp.listTools().length}`);
      break;
    }

    case 'run-mission': {
      console.log('Executing flagship mission: "Increase qualified leads by 30%"...\n');
      const result = await runIncreaseQualifiedLeadsMission();
      console.log('\n📊 MISSION EXECUTION RESULT:');
      console.log(`   - Status: ${result.status}`);
      console.log(`   - Stages Executed: ${result.stages.length}`);
      console.log(`   - Summary: ${result.summary}`);
      break;
    }

    // Daily, weekly and monthly all run whatever jobs are due; the job store decides what runs.
    case 'run-daily':
    case 'run-weekly':
    case 'run-monthly': {
      console.log('Running due department jobs...\n');
      const res = await runDueJobs();
      console.log(`\nStatus: ${res.status} (${res.summary})`);
      break;
    }

    case 'generate-report': {
      console.log('Synthesizing executive report...\n');
      const report = await harness.departments.run({ capability: 'skill_performance_reporting', input: {} });
        console.log('📈 EXECUTIVE PERFORMANCE REPORT:\n', JSON.stringify(report, null, 2));
      break;
    }

    case 'ads-status': {
      const ads = AdsConfigLoader.loadDefault();
      const ts = TokenStore.getInstance();
      console.log('\n📡 DIRECT ADS INTEGRATION STATUS:');
      for (const [name, cfg] of Object.entries(ads)) {
        const mode = cfg.mode;
        const defaultAcct = cfg.defaultAccountId || '(none)';
        let cred = 'n/a';
        if (name === 'google_ads') {
          const dev = process.env.ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN;
          const tok = process.env.ADS_DIRECT_GOOGLE_ACCESS_TOKEN || ts.getAccessToken('google_ads');
          cred = dev && tok ? 'configured' : 'MISSING (set ADS_DIRECT_GOOGLE_* tokens)';
        } else if (name === 'meta_ads') {
          const tok = process.env.ADS_DIRECT_META_ACCESS_TOKEN || ts.getAccessToken('meta_ads');
          cred = tok ? 'configured' : 'MISSING (set ADS_DIRECT_META_ACCESS_TOKEN)';
        } else if (name === 'ga4') {
          const tok = process.env.ADS_DIRECT_GA4_ACCESS_TOKEN || ts.getAccessToken('ga4');
          cred = tok ? 'configured' : 'MISSING (set ADS_DIRECT_GA4_ACCESS_TOKEN)';
        }
        const active = (mode === 'direct' || mode === 'dry-run') ? '🔥 LIVE' : (mode === 'off' ? '💤 mock' : `⚙ ${mode}`);
        console.log(`   · ${name.padEnd(12)} mode=${mode.padEnd(8)} ${active} | defaultAccount=${String(defaultAcct).slice(0, 28)} | ${cred}`);
      }
      console.log('\n   To enable a platform: set config/ads.yaml mode to direct|dry-run, provide the env\n   tokens above, then run `npm run build && node bin/cli.js status`.\n');
      break;
    }

    case 'doctor': {
      // Offline checks always; provider reads unless --offline. Non-zero exit on any failure (used by deploy scripts).
      const checks = await runDoctor({ live: !args.includes('--offline') });
      console.log(formatChecks(checks));
      if (checks.some(c => c.level === 'fail')) process.exitCode = 1;
      break;
    }

    case 'job': {
      // Run one scheduled system job now, e.g. `job ads-review`, `job report weekly`, `job competitor-watch`, `job kpi-snapshot`.
      const { defaultSystemHandlers } = await import('../dist/departments/scheduler.js');
      const { dataDir } = await import('../dist/config/paths.js');
      const handlers = defaultSystemHandlers(dataDir());
      const handler = handlers[args[1]];
      if (!handler) { console.log(`Usage: job <${Object.keys(handlers).join('|')}> [weekly|monthly]`); process.exitCode = 1; break; }
      const result = await handler(args[1] === 'report' ? { kind: args[2] === 'monthly' ? 'monthly' : 'weekly', force: true } : {});
      console.log(JSON.stringify(result, null, 2));
      if (result.status === 'FAILED') process.exitCode = 1;
      break;
    }

    case 'backup': {
      // Snapshot DATA_DIR into a folder (default <DATA_DIR>/backups/<timestamp>); deploy/backup.sh tars and rotates it.
      const { dataDir } = await import('../dist/config/paths.js');
      const dest = args[1] || dataDir('backups', new Date().toISOString().replace(/[:.]/g, '-'));
      const files = backupDataDir(dest);
      console.log(`Backed up ${files.length} file(s) to ${dest}`);
      break;
    }

    case 'create-user':
    case 'reset-password': {
      // Client login for this deployment. Prints a one-time password; the client must change it at first login.
      const username = args[1];
      if (!username) { console.error(`Usage: ${command} <username>`); process.exitCode = 1; break; }
      const { CoreStore } = await import('../dist/core/client/core-store.js');
      const store = new CoreStore();
      try {
        const { password } = command === 'create-user' ? store.createUserWithTemporaryPassword(username) : store.resetPassword(username);
        console.log(`Login for ${username}\n  one-time password: ${password}\n  (they will be asked to choose their own at first login)`);
      } catch (error) { console.error(error.message); process.exitCode = 1; }
      finally { store.close(); }
      break;
    }

    case 'ops': {
      // Operator summary from the running dashboard (inside the container: PORT + HARNESS_KEY are already set).
      const port = process.env.PORT || '3333';
      const res = await fetch(`http://127.0.0.1:${port}/api/ops/summary`, { headers: { 'x-harness-key': process.env.HARNESS_KEY || '' } });
      if (!res.ok) { console.error(`ops summary failed (${res.status}); is the dashboard running and HARNESS_KEY set?`); process.exitCode = 1; break; }
      const { digestText } = await import('../dist/ops/summary.js');
      console.log(args.includes('--json') ? JSON.stringify(await res.json(), null, 2) : digestText(await res.json()));
      break;
    }

    case 'google-auth': {
      // One-time sign-in: prints a refresh token for GA4 + Search Console (+ Google Ads with --ads) and lists what the account can see.
      const g = await import('../dist/ops/google.js');
      const flag = name => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; };
      const client = g.loadGoogleClient(flag('--client'));
      const scopes = [g.SCOPES.analytics, g.SCOPES.searchConsole, ...(args.includes('--ads') ? [g.SCOPES.ads] : [])];
      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin });
      const paste = () => new Promise((resolve, reject) => { rl.once('line', line => line.trim() ? resolve(line) : reject(new Error('empty'))); rl.once('close', () => reject(new Error('closed'))); });
      const { spawn } = await import('node:child_process');
      const open = url => {
        const [cmd, cmdArgs] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
        try { spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch {}
      };
      try {
        const result = await g.signIn(client, scopes, { open, log: s => console.log(s), paste });
        console.log('Signed in. Put these in the client\'s .env (keep them private, never in git):\n');
        if (flag('--client')) console.log(`GOOGLE_CLIENT_ID=${client.clientId}\nGOOGLE_CLIENT_SECRET=${client.clientSecret}`);
        console.log(`GOOGLE_REFRESH_TOKEN=${result.refreshToken}\n`);
        const props = await g.ga4Properties(result.accessToken).catch(e => { console.log(`(GA4 list failed: ${e.message})`); return []; });
        console.log(props.length ? 'GA4 properties this account can read (pick one for ADS_DIRECT_GA4_PROPERTY_ID):' : 'No GA4 properties visible to this account.');
        for (const p of props) console.log(`  ADS_DIRECT_GA4_PROPERTY_ID=${p.propertyId}   # ${p.name} (${p.account})`);
        const sites = await g.gscSites(result.accessToken).catch(e => { console.log(`(Search Console list failed: ${e.message})`); return []; });
        console.log(sites.length ? '\nSearch Console sites (pick one for GSC_SITE_URL):' : '\nNo Search Console sites visible to this account.');
        for (const s of sites) console.log(`  GSC_SITE_URL=${s.siteUrl}   # ${s.permission}`);
        console.log('\nThen run: node --env-file=.env bin/cli.js google-test');
      } catch (error) { console.error(error.message); process.exitCode = 1; }
      finally { rl.close(); }
      break;
    }

    case 'google-test': {
      // Read-only proof the connection works: GA4 property details + users/sessions, Search Console clicks/impressions.
      const g = await import('../dist/ops/google.js');
      const env = process.env;
      try {
        const client = g.loadGoogleClient();
        const refresh = env.GOOGLE_REFRESH_TOKEN ?? env.ADS_DIRECT_GA4_REFRESH_TOKEN;
        if (!refresh) throw new Error('No GOOGLE_REFRESH_TOKEN; run google-auth first');
        const token = await g.accessToken(client, refresh);
        const property = env.ADS_DIRECT_GA4_PROPERTY_ID;
        if (property) {
          const d = await g.ga4Details(token, property);
          const t = await g.ga4Totals(token, property);
          console.log(`GA4 ${property}: ${d.name} | timezone ${d.timeZone} | currency ${d.currency} | industry ${d.industry ?? '-'}`);
          console.log(`  last ${t.days} days: ${t.users} users, ${t.sessions} sessions, ${t.keyEvents} key events`);
        } else console.log('GA4: set ADS_DIRECT_GA4_PROPERTY_ID (the numeric id, not G-...). google-auth lists them.');
        if (env.GSC_SITE_URL) {
          const s = await g.gscTotals(token, env.GSC_SITE_URL);
          console.log(`Search Console ${env.GSC_SITE_URL}: last ${s.days} days (to 3 days ago): ${s.clicks} clicks, ${s.impressions} impressions, CTR ${(s.ctr * 100).toFixed(1)}%, avg position ${s.position.toFixed(1)}`);
        } else console.log('Search Console: set GSC_SITE_URL (sc-domain:example.com or https://www.example.com/). google-auth lists them.');
      } catch (error) { console.error(error.message); process.exitCode = 1; }
      break;
    }

    case 'dashboard': {
      const port = parseInt(process.env.PORT || args[1] || '3333', 10);
      const host = process.env.HOST || '127.0.0.1';
      const server = new VisualizationServer(port, undefined, host);
      await server.start();
      if (process.env.SCHEDULER !== 'off') {
        const { Scheduler, defaultJobs, opsJobs } = await import('../dist/departments/scheduler.js');
        server.scheduler = new Scheduler({ departments: { mode: process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live' },
          handlers: server.opsHandlers(), jobs: [...defaultJobs(), ...opsJobs()] }).start();
        console.log('   Scheduler running (every 60s). Set SCHEDULER=off to disable.');
      }
      console.log(`\n🚀 Dashboard reachable at: http://localhost:${port}`);
      console.log('   (Bound to ' + host + ' — accessible from your LAN / VPS / Railway)');
      console.log('Press Ctrl+C to shut down dashboard server.\n');

      process.on('uncaughtException', (err) => {
        console.error('[Dashboard Error]', err);
      });
      process.on('unhandledRejection', (reason) => {
        console.error('[Dashboard Rejection]', reason);
      });

      // Keep server alive indefinitely
      setInterval(() => {}, 60000);
      break;
    }

    default:
      console.log(`Unknown command: "${command}". Available commands: status, doctor [--offline], job <name>, backup [dest], create-user <name>, reset-password <name>, ops [--json], google-auth [--client file.json] [--ads], google-test, ads-status, run-mission, run-daily, run-weekly, run-monthly, generate-report, dashboard`);
  }
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
