import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { json } from 'node:stream/consumers';
import { MemoryManager } from '../memory/memory-manager.js';
import { AuditTrail } from '../observability/audit-trail.js';
import { logger } from '../observability/logger.js';
import { VisualizationEventBus, HarnessEvent, VisualizationAgentState } from '../visualization/event-bus.js';
import { OFFICES } from '../visualization/office-mapper.js';
import { AgentStateAdapter } from '../visualization/agent-state-adapter.js';
import { DeepSeekHarnessBrain } from '../core/deepseek/deepseek-brain.js';
import { ConfigLoader } from '../config/config-loader.js';
import { createDepartment } from '../departments/runtime.js';
import { departmentIds, type DepartmentId } from '../departments/catalog.js';
import { runIncreaseQualifiedLeadsMission } from '../workflows/missions/increase-qualified-leads.js';
import { runDueJobs } from '../workflows/daily-loop.js';
import { createMarketingModules } from '../core/modules/registry.js';
import { CoreStore } from '../core/client/core-store.js';
import { DecodeService } from '../modules/decode/index.js';
import { dataDir } from '../config/paths.js';
import type { Scheduler } from '../departments/scheduler.js';
import { TrackingStore } from '../core/tracking/store.js';
import { onLlmCost, setLlmSpendSource } from '../core/llm/index.js';
import { handleConsoleRoute } from './console-routes.js';
import { opsSummary, summaryLine, digestText, type OpsSummary } from '../ops/summary.js';
import { inbox } from './console-routes.js';
import { DepartmentJobs, type SystemHandlers } from '../departments/jobs.js';
import { alert } from '../observability/alerts.js';

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 10;
const PACKAGE_VERSION: string = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

export class VisualizationServer {
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private publicDir: string;
  private sseClients: Set<http.ServerResponse> = new Set();
  private eventBus = VisualizationEventBus.getInstance();
  private stateAdapter = AgentStateAdapter.getInstance();
  private tasks = new Map<string, Record<string, any>>();
  private modules;
  private core;
  private decode;
  private storageDir: string;
  /** Set by the dashboard command; absent in tests and one-off servers. */
  public scheduler?: Scheduler;
  readonly tracking: TrackingStore;
  private stopCostLedger: () => void;
  // ponytail: in-memory per-IP login throttle; resets on restart, fine for one client per deployment.
  private loginFailures = new Map<string, number[]>();

  constructor(port = 3333, publicDir?: string, host?: string, storageDir = dataDir()) {
    this.port = port;
    // Live tools must not be exposed to the LAN by default.
    this.host = host || process.env.HOST || '127.0.0.1';
    this.publicDir = publicDir || path.join(process.cwd(), 'public');
    this.storageDir = storageDir;
    this.modules = createMarketingModules({ storageDir, mode: process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live', onEvent: this.publishDepartmentEvent });
    this.core = new CoreStore(path.join(storageDir, 'core'));
    this.tracking = new TrackingStore(path.join(storageDir, 'tracking'));
    this.stopCostLedger = onLlmCost(e => this.tracking.addCost({ kind: 'llm', provider: e.provider, model: e.model, usd: e.costUsd, purpose: e.purpose, ts: e.at,
      units: Number(e.usage?.prompt_tokens ?? 0) + Number(e.usage?.completion_tokens ?? 0) }));
    setLlmSpendSource(() => this.tracking.monthToDateUsd(Date.now(), 'llm'));
    this.decode = new DecodeService(path.join(storageDir, 'decode'), event => this.broadcastSSE('decode', event), {
      // Own-ads decode reads through the ads module, so its account allowlist and read-only tools apply.
      runAds: async (capability, input) => {
        const output: any = (await this.modules.get('ads').run({ capability, input })).data;
        if (output?.status && output.status !== 'COMPLETED') throw new Error(`${capability}: ${output.error ?? output.status}`);
        return output?.status === 'COMPLETED' && 'data' in output ? output.data : output;
      }
    });
    this.setupEventListener();
  }

  private onHarnessEvent = (event: HarnessEvent) => {
    this.broadcastSSE('event', event);
    try { this.trackActivity(event); } catch (e: any) { logger.warn('Tracking', `activity not recorded: ${e.message}`); }
  };

  private setupEventListener(): void {
    this.eventBus.on('harness_event', this.onHarnessEvent);
  }

  /** Timeline entries for what the system did and what the client did. */
  private trackActivity(event: HarnessEvent): void {
    if (event.type === 'ADS_OPERATION_CHANGED') {
      const label: Record<string, [string, string]> = {
        PENDING_APPROVAL: ['ads.pending', `Ad change ready for your approval (${event.tool})`],
        AUTHORIZED: ['ads.approved', `Ad change approved (${event.tool})`],
        REJECTED: ['ads.rejected', `Ad change declined (${event.tool})`],
        VERIFIED: ['ads.verified', `Ad change applied and verified (${event.tool})`],
        FAILED: ['ads.failed', `Ad change failed (${event.tool})`],
        UNCERTAIN: ['ads.uncertain', `Ad change needs a manual check (${event.tool})`],
        PARTIAL: ['ads.partial', `Ad change partly applied (${event.tool})`]
      };
      const entry = label[event.status];
      if (entry) this.tracking.log(['AUTHORIZED', 'REJECTED'].includes(event.status) ? 'client' : 'system', entry[0], entry[1], event.operationId);
    }
  }

  /** Real department runs drive the office view: each department's lead desk mirrors its task status. */
  private publishDepartmentEvent = (event: { department: string; taskId: string; status: string; capability: string }): void => {
    const agentId = OFFICES.find(office => office.id === event.department)?.workstations[0]?.agentId;
    if (!agentId) return;
    const statuses: Record<string, VisualizationAgentState> = { RUNNING: 'WORKING', COMPLETED: 'COMPLETED', FAILED: 'FAILED', PENDING_APPROVAL: 'WAITING_FOR_HUMAN' };
    const status = statuses[event.status] ?? 'WORKING';
    this.eventBus.emitEvent({ type: 'AGENT_STATE_CHANGED', agentId, department: event.department, status, taskId: event.taskId, taskName: event.capability, tool: event.capability, timestamp: Date.now() });
  };

  private broadcastSSE(eventType: string, data: any): void {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(err => {
          logger.error('VisualizationServer', `Unhandled error in request: ${err.message}`);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
          }
        });
      });

      this.server.listen(this.port, this.host, () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') this.port = address.port;
        logger.success('VisualizationServer', `Live 3D Office & Dashboard running at: http://${this.host === '0.0.0.0' ? 'localhost' : this.host}:${this.port} (bound to ${this.host})`);
        resolve(this.port);
      });

      this.server.on('error', (err: any) => {
        reject(err);
      });
    });
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server) {
        for (const client of this.sseClients) {
          try { client.end(); } catch {}
        }
        this.sseClients.clear();
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await this.modules.close();
    this.eventBus.off('harness_event', this.onHarnessEvent);
    this.stopCostLedger();
    this.core.close();
    this.tracking.close();
  }

  async opsSummary(): Promise<OpsSummary> {
    const jobs = new DepartmentJobs(path.join(this.storageDir, 'jobs'));
    try {
      const pending = await inbox({ tracking: this.tracking, ads: this.modules.get('ads'), parseBody: r => this.parseBody(r) });
      return opsSummary({ tracking: this.tracking, jobs: jobs.list(), pending });
    } finally { jobs.close(); }
  }

  /** Scheduler handlers that need the live server (the approvals inbox). */
  opsHandlers(): SystemHandlers {
    return {
      'ops-digest': async () => {
        const summary = await this.opsSummary();
        await alert('info', `ops-digest:${summary.generatedAt.slice(0, 10)}`, digestText(summary));
        return { status: 'COMPLETED' };
      },
      'approval-chaser': async () => {
        const { approvals } = await this.opsSummary();
        for (const item of approvals.over48h) await alert('warn', `approval-chaser:${item.id}`, `Client has not answered "${item.title}" for over 48h; nudge them`);
        return { status: 'COMPLETED', chased: approvals.over48h.length };
      }
    };
  }

  private health() {
    let dataDirWritable = true;
    try { fs.accessSync(this.storageDir, fs.constants.W_OK); } catch { dataDirWritable = false; }
    const schedulerAlive = this.scheduler ? this.scheduler.alive() : null;
    return { ok: dataDirWritable && schedulerAlive !== false, version: PACKAGE_VERSION, dataDirWritable, schedulerAlive };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const origin = req.headers.origin;
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? '');
    const sameOrigin = !origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
    const host = req.headers.host || `localhost:${this.port}`;
    const parsedUrl = new URL(req.url || '/', `http://${host}`);
    const pathname = parsedUrl.pathname;
    // Public liveness probe for Railway/Docker: no auth, no secrets.
    if (pathname === '/api/health' && req.method === 'GET') {
      const body = this.health();
      res.writeHead(body.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    // Two kinds of caller. Operator: HARNESS_KEY in the x-harness-key header (?key only for EventSource, which cannot set headers).
    // Client: a login session cookie. The static app shell (login screen) is public; every /api route except login needs one of them.
    const harnessKey = process.env.HARNESS_KEY;
    const headerKey = Boolean(harnessKey && req.headers['x-harness-key'] === harnessKey);
    const operator = headerKey || Boolean(harnessKey && pathname === '/api/events/stream' && parsedUrl.searchParams.get('key') === harnessKey);
    if (!sameOrigin && !headerKey) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cross-origin requests need the x-harness-key header' }));
      return;
    }
    if (origin && sameOrigin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-harness-key, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const publicCoreRoute = pathname === '/api/core/onboarding/status'
      || pathname === '/api/core/onboarding'
      || pathname === '/api/core/auth/login'
      || pathname === '/api/core/auth/session';   // answers {user: null} when signed out
    const legacyApiToken = Boolean(process.env.MARKETING_API_TOKEN && req.headers.authorization === `Bearer ${process.env.MARKETING_API_TOKEN}`);
    if (pathname.startsWith('/api/') && !publicCoreRoute && !operator && !legacyApiToken && !this.authenticatedUser(req)) {
      // Local development before any user exists stays open; nothing else does.
      const localDev = local && localHost && !harnessKey && !this.core.hasAdmin();
      if (!localDev) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }
    }

    // SSE Stream
    if (pathname === '/api/events/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      this.sseClients.add(res);

      res.write(`event: init\ndata: ${JSON.stringify({ agents: this.stateAdapter.getAllAgentsState() })}\n\n`);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // API Routes
    if (pathname.startsWith('/api/')) {
      await this.handleApiRoute(pathname, req, res, parsedUrl);
      return;
    }

    // Static Assets
    this.serveStatic(pathname, res);
  }

  private parseBody(req: http.IncomingMessage): Promise<any> {
    return json(req).catch(() => ({}));
  }

  private async handleApiRoute(pathname: string, req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: URL): Promise<void> {
    if (pathname === '/api/departments/catalog' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(departmentIds.map(id => ({ id, capabilities: createDepartment(id).listCapabilities() }))));
      return;
    }
    const departmentRoute = /^\/api\/departments\/([a-z]+)\/(run|tools)$/.exec(pathname);
    if (departmentRoute) {
      const id = departmentRoute[1] as DepartmentId;
      const address = req.socket.remoteAddress;
      const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address ?? '');
      const token = process.env.MARKETING_API_TOKEN;
      const authenticated = !!token && req.headers.authorization === `Bearer ${token}`;
      const origin = req.headers.origin;
      const sameOrigin = !origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
      if ((!local || !sameOrigin) && !authenticated) { res.writeHead(403); res.end('Department API requires a local same-origin request or MARKETING_API_TOKEN'); return; }
      if (!departmentIds.includes(id)) { res.writeHead(404); res.end('Unknown department'); return; }
      const runtime = createDepartment(id, { onEvent: this.publishDepartmentEvent });
      try {
        const result = departmentRoute[2] === 'tools' && req.method === 'GET' ? await runtime.listTools()
          : departmentRoute[2] === 'run' && req.method === 'POST' ? await runtime.run(await this.parseBody(req))
          : (() => { throw new Error('Unsupported method'); })();
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
      } catch (error: any) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
      finally { await runtime.close(); }
      return;
    }
    const memory = MemoryManager.getInstance();
    const audit = AuditTrail.getInstance();

    const sendJson = (data: any, statusCode = 200) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
    };

    if (await this.handleCoreAuthRoute(pathname, req, res, sendJson)) return;

    // Operator-only: a client session must never see costs or other internals.
    if (pathname === '/api/ops/summary' && req.method === 'GET') {
      if (!process.env.HARNESS_KEY || req.headers['x-harness-key'] !== process.env.HARNESS_KEY) { sendJson({ error: 'Operator key required' }, 403); return; }
      const summary = await this.opsSummary();
      if (parsedUrl.searchParams.get('format') === 'line') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(summaryLine(summary)); return; }
      sendJson(summary); return;
    }
    if (await handleConsoleRoute({ tracking: this.tracking, ads: this.modules.get('ads'), parseBody: r => this.parseBody(r) }, pathname, req, sendJson)) return;
    if (await this.handleModuleRoute(pathname, req, sendJson)) return;

    if (pathname === '/api/status' && req.method === 'GET') {
      const summary = memory.summary();
      sendJson({
        business: summary.facts,
        personasCount: summary.personas.length,
        learnedRulesCount: summary.rules.length,
        learningsCount: summary.learnings.length,
        capabilities: {
          agents: this.stateAdapter.getAllAgentsState().length,
          offices: OFFICES.length,
          tasks: this.tasks.size
        }
      });
      return;
    }

    if (pathname === '/api/offices' && req.method === 'GET') {
      sendJson({
        offices: OFFICES,
        summary: this.stateAdapter.getDepartmentSummary()
      });
      return;
    }

    if (pathname === '/api/agents' && req.method === 'GET') {
      sendJson({
        agents: this.stateAdapter.getAllAgentsState(),
        summary: this.stateAdapter.getDepartmentSummary()
      });
      return;
    }

    if (pathname.startsWith('/api/agents/') && req.method === 'GET') {
      const agentId = pathname.replace('/api/agents/', '');
      const state = this.stateAdapter.getAgentState(agentId);
      if (state) {
        sendJson(state);
      } else {
        sendJson({ error: 'Agent not found' }, 404);
      }
      return;
    }

    if (pathname === '/api/tasks' && req.method === 'GET') {
      sendJson({
        tasks: [...this.tasks.values()]
      });
      return;
    }

    if (pathname === '/api/audit' && req.method === 'GET') {
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
      const question = parsedUrl.searchParams.get('question');
      let records = audit.getRecentDecisions(limit);
      if (question) {
        records = records.filter(r => r.question === question);
      }
      sendJson({
        records
      });
      return;
    }


    // Workflow Triggers
    if (pathname === '/api/workflows/run-mission' && req.method === 'POST') {
      // Trigger mission asynchronously so HTTP response is returned immediately
      setTimeout(async () => {
        try {
          await runIncreaseQualifiedLeadsMission();
        } catch (err: any) {
          logger.error('VisualizationServer', `Mission execution failed: ${err.message}`);
        }
      }, 50);

      sendJson({ success: true, message: 'Flagship mission triggered in background' });
      return;
    }

    if (pathname === '/api/workflows/run-daily' && req.method === 'POST') {
      setTimeout(async () => {
        try {
          await runDueJobs(this.storageDir);
        } catch (err: any) {
          logger.error('VisualizationServer', `Daily loop execution failed: ${err.message}`);
        }
      }, 50);

      sendJson({ success: true, message: 'Daily loop triggered in background' });
      return;
    }

    // Ad-hoc task trigger through the same department runtime used by every other entry point.
    if (pathname === '/api/workflows/trigger' && req.method === 'POST') {
      const body = await this.parseBody(req);
      const objective: string = body.objective || 'Report paid media performance';
      const assignedAgent: string = body.assignedAgent || 'reporting_agent';
      const inputData: Record<string, any> = body.inputData || {};
      const taskId = randomUUID();
      const capability = body.capability || body.requiredSkills?.[0] || 'skill_performance_reporting';
      const task = { taskId, objective, assignedAgent, capability, inputData, status: 'CREATED', createdAt: Date.now(), updatedAt: Date.now() };
      this.tasks.set(taskId, task);

      // Execute asynchronously so HTTP response returns immediately
      setTimeout(async () => {
        try {
          task.status = 'RUNNING'; task.updatedAt = Date.now();
          const runtime = createDepartment('hq', { mode: process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live', onEvent: this.publishDepartmentEvent });
          try {
            const result = await runtime.run({ taskId, capability, input: inputData, objective });
            Object.assign(task, { status: result.status, output: result.output, updatedAt: Date.now() });
          } finally { await runtime.close(); }
        } catch (err: any) {
          Object.assign(task, { status: 'FAILED', error: err.message, updatedAt: Date.now() });
          logger.error('VisualizationServer', `Task execution failed: ${err.message}`);
        }
      }, 50);

      sendJson({ success: true, taskId, message: `Task "${objective}" created and executing under ${assignedAgent}` });
      return;
    }

    // DeepSeek Harness Brain Sessions API
    const brain = DeepSeekHarnessBrain.getInstance();

    if (pathname === '/api/sessions/create' && req.method === 'POST') {
      const body = await this.parseBody(req);
      const prompt = body.prompt || body.message || 'Analyze our Meta campaigns from yesterday and create optimization recommendations.';
      try {
        const session = await brain.createSession(prompt);
        sendJson({ success: true, session });
      } catch (err: any) {
        sendJson({ error: err.message }, 500);
      }
      return;
    }

    if (pathname === '/api/sessions' && req.method === 'GET') {
      sendJson({
        activeSession: brain.getActiveSession(),
        sessions: brain.getAllSessions()
      });
      return;
    }

    if (pathname.startsWith('/api/sessions/') && req.method === 'GET') {
      const sessionId = pathname.replace('/api/sessions/', '');
      const sess = brain.getSession(sessionId);
      if (sess) {
        sendJson(sess);
      } else {
        sendJson({ error: 'Session not found' }, 404);
      }
      return;
    }

    // Departments API
    if (pathname === '/api/departments' && req.method === 'GET') {
      const offices = OFFICES;
      const summary = this.stateAdapter.getDepartmentSummary();
      const detailed = offices.map(o => ({
        ...o,
        telemetry: summary[o.id] || { total: o.workstations.length, working: 0, idle: o.workstations.length, waiting: 0, completed: 0, hitl: 0 }
      }));
      sendJson({ departments: detailed });
      return;
    }

    // Memory Summary API
    if (pathname === '/api/memory/summary' && req.method === 'GET') {
      const { facts, personas, rules, learnings } = memory.summary();
      sendJson({ facts, personas, rules, learnings });
      return;
    }

    // MY BUSINESS SETTINGS API (reads + writes config/business.yaml live)
    if (pathname === '/api/business/config' && req.method === 'GET') {
      const config = ConfigLoader.loadConfig();
      sendJson({ config });
      return;
    }

    if (pathname === '/api/business/config' && (req.method === 'PATCH' || req.method === 'PUT')) {
      const body = await this.parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson({ error: 'No changes supplied.' }, 400);
        return;
      }

      try {
        const reloaded = ConfigLoader.update(current => this.deepMerge(current, body));
        // Push new config into live memory so agents see it immediately.
        MemoryManager.getInstance(reloaded).persistAllToDisk();
        this.tracking.log('client', 'business.updated', `Business details updated: ${Object.keys(body).join(', ')}`);

        this.broadcastSSE('event', {
          type: 'BUSINESS_CONFIG_UPDATED',
          timestamp: Date.now(),
          sections: Object.keys(body),
          taskName: 'Business settings updated — the team now works with your new facts.'
        });

        sendJson({ success: true, config: reloaded });
      } catch (err: any) {
        const detail = err?.issues
          ? err.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : err.message;
        sendJson({ error: 'Could not save — check the highlighted fields.', details: detail }, 400);
      }
      return;
    }

    // Quick phrase toggles for the brand voice editor
    if (pathname === '/api/business/phrases' && req.method === 'POST') {
      const body = await this.parseBody(req);
      const kind: 'banned' | 'preferred' = body.kind === 'banned' ? 'banned' : 'preferred';
      const phrase: string = String(body.phrase || '').trim();
      if (!phrase) {
        sendJson({ error: 'Phrase is empty.' }, 400);
        return;
      }
      try {
        const listKey = kind === 'banned' ? 'bannedPhrases' : 'preferredPhrases';
        const same = (p: string) => p.toLowerCase() === phrase.toLowerCase();
        const reloaded = ConfigLoader.update(current => {
          const list: string[] = (current.brand as any)[listKey];
          (current.brand as any)[listKey] = body.action === 'remove' ? list.filter(p => !same(p)) : list.some(same) ? list : [...list, phrase];
          return current;
        });
        MemoryManager.getInstance(reloaded).persistAllToDisk();
        sendJson({ success: true, [listKey]: (reloaded.brand as any)[listKey] });
      } catch (err: any) {
        sendJson({ error: err.message }, 400);
      }
      return;
    }

    sendJson({ error: 'Endpoint not found' }, 404);
  }

  private requestToken(req: http.IncomingMessage): string | undefined {
    const authorization = req.headers.authorization;
    if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
    const match = /(?:^|;\s*)marketing_session=([^;]+)/.exec(req.headers.cookie ?? '');
    if (!match) return undefined;
    try { return decodeURIComponent(match[1]); } catch { return undefined; }
  }

  private authenticatedUser(req: http.IncomingMessage) {
    return this.core.authenticate(this.requestToken(req));
  }

  private setSessionCookie(req: http.IncomingMessage, res: http.ServerResponse, token: string, expiresAt: number): void {
    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const secure = req.headers['x-forwarded-proto'] === 'https' || Boolean((req.socket as any).encrypted);
    res.setHeader('Set-Cookie', `marketing_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  }

  private async handleCoreAuthRoute(pathname: string, req: http.IncomingMessage, res: http.ServerResponse, sendJson: (data: any, statusCode?: number) => void): Promise<boolean> {
    if (pathname === '/api/core/onboarding/status' && req.method === 'GET') {
      sendJson({ required: !this.core.hasAdmin() }); return true;
    }
    if (pathname === '/api/core/onboarding' && req.method === 'POST') {
      // Production logins are created by the operator (bin/cli.js create-user); nobody can claim an empty deployment.
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ONBOARDING !== '1') { sendJson({ error: 'Sign-up is disabled; ask your account manager for a login' }, 403); return true; }
      const operator = Boolean(process.env.HARNESS_KEY && req.headers['x-harness-key'] === process.env.HARNESS_KEY);
      const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
        && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? '');
      if (!operator && (!local || Boolean(process.env.HARNESS_KEY))) { sendJson({ error: 'Onboarding requires local access or the operator key' }, 403); return true; }
      if (this.core.hasAdmin()) { sendJson({ error: 'Client administrator is already configured' }, 409); return true; }
      try {
        const body = await this.parseBody(req);
        const session = this.core.createAdmin(String(body.username ?? ''), String(body.password ?? ''));
        this.setSessionCookie(req, res, session.token, session.expiresAt);
        sendJson(session, 201);
      } catch (error) { sendJson({ error: error instanceof Error ? error.message : String(error) }, 400); }
      return true;
    }
    if (pathname === '/api/core/auth/login' && req.method === 'POST') {
      // Forwarded headers are caller-controlled; a reverse proxy shares this socket-level limit.
      const ip = req.socket.remoteAddress ?? '';
      const attempts = (this.loginFailures.get(ip) ?? []).filter(t => t > Date.now() - LOGIN_WINDOW_MS);
      if (attempts.length >= LOGIN_MAX_FAILURES) { sendJson({ error: 'Too many attempts; try again in 15 minutes' }, 429); return true; }
      const body = await this.parseBody(req);
      const session = this.core.login(String(body.username ?? ''), String(body.password ?? ''));
      if (!session) { this.loginFailures.set(ip, [...attempts, Date.now()]); sendJson({ error: 'Invalid username or password' }, 401); return true; }
      this.loginFailures.delete(ip);
      this.tracking.log('client', 'login', `${session.user.username} signed in`);
      this.setSessionCookie(req, res, session.token, session.expiresAt);
      sendJson(session); return true;
    }
    if (pathname === '/api/core/auth/session' && req.method === 'GET') {
      const user = this.authenticatedUser(req);
      sendJson({ user, mustChangePassword: user ? this.core.mustChangePassword(user.id) : false }); return true;
    }
    if (pathname === '/api/core/auth/password' && req.method === 'POST') {
      const user = this.authenticatedUser(req);
      if (!user) { sendJson({ error: 'Authentication required' }, 401); return true; }
      const body = await this.parseBody(req);
      try { this.core.changePassword(user.id, String(body.current ?? ''), String(body.next ?? '')); }
      catch (error) { sendJson({ error: error instanceof Error ? error.message : String(error) }, 400); return true; }
      this.tracking.log('client', 'password.changed', 'Password changed');
      sendJson({ ok: true }); return true;
    }
    if (pathname === '/api/core/auth/logout' && req.method === 'POST') {
      this.core.logout(this.requestToken(req));
      res.setHeader('Set-Cookie', 'marketing_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      res.writeHead(204); res.end(); return true;
    }
    return false;
  }

  private async handleModuleRoute(pathname: string, req: http.IncomingMessage, sendJson: (data: any, statusCode?: number) => void): Promise<boolean> {
    const ads = this.modules.get('ads');
    try {
      const runAds = async (capability: string, input: Record<string, any> = {}) => {
        const output: any = (await ads.run({ capability, input })).data;
        return output?.status === 'COMPLETED' && 'data' in output ? output.data : output;
      };
      if (pathname === '/api/provider-versions' && req.method === 'GET') { sendJson(await runAds('ads_provider_versions')); return true; }
      for (const [prefix, capability] of [['meta','meta_ads_capabilities'],['google-ads','google_ads_capabilities'],['ga4','ga4_capabilities']] as const) {
        if (pathname === `/api/${prefix}/capabilities` && req.method === 'GET') { sendJson(await runAds(capability)); return true; }
      }
      if (pathname === '/api/meta/readiness' && req.method === 'POST') { sendJson(await runAds('meta_ads_readiness', await this.parseBody(req))); return true; }
      if (pathname === '/api/meta/campaigns/validate' && req.method === 'POST') { sendJson(await runAds('meta_ads_validate_campaign', await this.parseBody(req))); return true; }
      if (pathname === '/api/meta/launches' && req.method === 'POST') { const body = await this.parseBody(req); const { action, ...input } = body; sendJson(await runAds(action === 'prepare' ? 'meta_ads_prepare_launch' : 'ads_launch_meta', input)); return true; }
      const metaVerify = /^\/api\/meta\/launches\/([^/]+)\/verify$/.exec(pathname);
      if (metaVerify && req.method === 'POST') { sendJson({ launchId: metaVerify[1], result: await runAds('ads.operation.resume', { operationId: metaVerify[1] }) }); return true; }
      if (pathname === '/api/google-ads/readiness' && req.method === 'POST') { sendJson(await runAds('google_ads_readiness', await this.parseBody(req))); return true; }
      if (pathname === '/api/google-ads/campaigns/validate' && req.method === 'POST') { sendJson(await runAds('google_ads_validate_search_campaign', await this.parseBody(req))); return true; }
      if (pathname === '/api/google-ads/launches' && req.method === 'POST') { sendJson(await runAds('google_ads_prepare_search_launch', await this.parseBody(req))); return true; }
      if (pathname === '/api/google-ads/reports' && req.method === 'POST') { sendJson(await runAds('google_ads_search', await this.parseBody(req))); return true; }
      if (pathname === '/api/ga4/readiness' && req.method === 'POST') { sendJson(await runAds('ga4_readiness', await this.parseBody(req))); return true; }
      if (pathname === '/api/ga4/reports' && req.method === 'POST') { sendJson(await runAds('ga4_run_validated_report', await this.parseBody(req))); return true; }
      if (pathname === '/api/ga4/audits' && req.method === 'POST') { sendJson(await runAds('ga4_tracking_audit', await this.parseBody(req))); return true; }
      if (pathname === '/api/ga4/admin-proposals' && req.method === 'POST') { sendJson(await runAds('ga4_create_admin_proposal', await this.parseBody(req)), 201); return true; }
      if (pathname === '/api/measurement/reconciliation' && req.method === 'POST') { sendJson(await runAds('ads_reconcile_measurement', await this.parseBody(req))); return true; }
      if (pathname === '/api/ads/dashboard' && req.method === 'GET') {
        const kinds = ['meta_readiness','google_readiness','ga4_readiness','report','recommendation','schedule','ga4_audit','reconciliation'];
        const records = Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await runAds('ads_list_records', { kind })])));
        const operations = await runAds('ads_list_operations', { statuses: ['DRAFT','PENDING_APPROVAL','AUTHORIZED','DISPATCHED','FAILED','PARTIAL','UNCERTAIN'] });
        sendJson({ health: await ads.health(), capabilities: ads.listCapabilities(), records, operations }); return true;
      }
      if (pathname === '/api/ads/analysis' && req.method === 'POST') {
        const body = await this.parseBody(req);
        sendJson(await ads.run({ capability: body.capability, input: body.input ?? body, objective: body.objective })); return true;
      }
      if (pathname === '/api/ads/recommendations' && req.method === 'GET') {
        sendJson({ recommendations: await runAds('ads_list_records', { kind: 'recommendation' }) }); return true;
      }
      const operation = /^\/api\/ads\/operations\/([^/]+)\/(approve|reject|resume)$/.exec(pathname);
      if (operation && req.method === 'POST') {
        sendJson(await ads.run({ capability: `ads.operation.${operation[2]}`, input: { operationId: operation[1] } })); return true;
      }
      if (pathname === '/api/decode/runs' && req.method === 'GET') { sendJson({ runs: this.decode.list() }); return true; }
      if (pathname === '/api/decode/runs' && req.method === 'POST') { sendJson({ run: this.decode.start(await this.parseBody(req)) }, 202); return true; }
      const decodeRun = /^\/api\/decode\/runs\/([^/]+)(\/stop)?$/.exec(pathname);
      if (decodeRun && req.method === 'GET' && !decodeRun[2]) {
        const run = this.decode.get(decodeRun[1]);
        if (run) sendJson({ run }); else sendJson({ error: 'Decode run not found' }, 404);
        return true;
      }
      if (decodeRun && req.method === 'POST' && decodeRun[2]) { sendJson({ stopping: this.decode.stop(decodeRun[1]) }); return true; }
      if (pathname === '/api/core/reports/summary' && req.method === 'GET') {
        const generatedAt = Date.now();
        sendJson({ sections: [
          { module: 'ads', title: 'Paid media', generatedAt, data: await ads.health() }
        ] }); return true;
      }
      if (pathname === '/api/core/jobs/health' && req.method === 'GET') {
        sendJson({ status: 'ready', modules: await Promise.all(this.modules.list().map(module => module.health())) }); return true;
      }
    } catch (error) {
      sendJson({ error: error instanceof Error ? error.message : String(error) }, 400); return true;
    }
    return false;
  }

  private deepMerge(target: any, source: any): any {
    for (const key of Object.keys(source)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe business settings key');
      const sv = source[key];
      if (sv && typeof sv === 'object' && !Array.isArray(sv) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        this.deepMerge(target[key], sv);
      } else {
        target[key] = sv;
      }
    }
    return target;
  }

  /** index.html carries {{APP_NAME}} / {{BRAND_INITIAL}} so one image serves every client's branding. */
  private serveIndex(file: string, res: http.ServerResponse): void {
    let name = process.env.APP_NAME;
    if (!name) { try { name = ConfigLoader.loadConfig().business.name; } catch { name = 'Marketing'; } }
    const initial = process.env.BRAND_INITIAL || name.trim().charAt(0).toUpperCase();
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file, 'utf8').replaceAll('{{APP_NAME}}', esc(name)).replaceAll('{{BRAND_INITIAL}}', esc(initial)));
  }

  private serveStatic(pathname: string, res: http.ServerResponse): void {
    let safePath = pathname;
    if (safePath === '/' || safePath === '') {
      safePath = '/index.html';
    }

    // Prevent path traversal
    const normalized = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(this.publicDir, normalized);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // Fallback to index.html for SPA routing
      const indexFile = path.join(this.publicDir, 'index.html');
      if (fs.existsSync(indexFile)) return this.serveIndex(indexFile, res);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    if (path.basename(filePath) === 'index.html') return this.serveIndex(filePath, res);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  }
}
