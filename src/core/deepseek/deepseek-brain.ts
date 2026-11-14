import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDeepSeek } from './tool-runner.js';
import { VisualizationEventBus } from '../../visualization/event-bus.js';
import { dataDir } from '../../config/paths.js';
import { llmProviders } from '../llm/index.js';

export interface DeepSeekSessionStage {
  id: string; name: string; department: string; assignedAgent: string;
  status: 'PENDING' | 'ACTIVE' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED';
  progress: number; outputSummary?: string; taskId?: string; taskObjective?: string; startedAt?: number; completedAt?: number;
}
export interface DeepSeekHarnessSession {
  sessionId: string; title: string; userPrompt: string;
  status: 'PLANNING' | 'RUNNING' | 'WAITING_HITL' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  progress: number; totalTasks: number; completedTasks: number; activeAgentsCount: number;
  workingAgents: string[]; waitingAgents: string[]; hitlRequired: boolean; currentStageIndex: number;
  stages: DeepSeekSessionStage[]; insightsLearned: string[]; executiveSummary?: string;
  createdAt: number; updatedAt: number; completedAt?: number;
}
export class DeepSeekHarnessBrain {
  private static instance: DeepSeekHarnessBrain;
  private sessions = new Map<string, DeepSeekHarnessSession>();
  private activeSessionId?: string;
  static getInstance() { return this.instance ??= new DeepSeekHarnessBrain(); }
  /** Reload saved sessions; anything mid-run when the process died is marked INTERRUPTED, never resumed silently. */
  constructor() {
    let files: string[] = [];
    try { files = readdirSync(dataDir('sessions')).filter(name => name.endsWith('.json')); } catch { return; }
    for (const name of files) {
      try {
        const session: DeepSeekHarnessSession = JSON.parse(readFileSync(join(dataDir('sessions'), name), 'utf8'));
        if (session.status === 'RUNNING' || session.status === 'PLANNING') {
          session.status = 'INTERRUPTED';
          session.updatedAt = Date.now();
          this.persist(session);
        }
        this.sessions.set(session.sessionId, session);
      } catch { /* skip a corrupt session file */ }
    }
  }
  getAllSessions() { return [...this.sessions.values()].sort((a,b) => b.createdAt - a.createdAt); }
  getSession(id: string) { return this.sessions.get(id); }
  getActiveSession() { return this.activeSessionId ? this.sessions.get(this.activeSessionId) : undefined; }
  async createSession(prompt: string): Promise<DeepSeekHarnessSession> {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 30000) throw new Error('Provide a prompt of 1..30000 characters');
    if (!llmProviders().length) throw new Error('Set DEEPSEEK_API_KEY+DEEPSEEK_MODEL or OPENROUTER_API_KEY+OPENROUTER_TEXT_MODEL before starting a model session');

    const session: DeepSeekHarnessSession = {
      sessionId: randomUUID(),
      title: prompt.slice(0,80),
      userPrompt: prompt,
      status: 'RUNNING',
      progress: 0,
      totalTasks: 0,
      completedTasks: 0,
      activeAgentsCount: 0,
      workingAgents: [],
      waitingAgents: [],
      hitlRequired: false,
      currentStageIndex: 0,
      stages: [],
      insightsLearned: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.sessions.set(session.sessionId, session);
    this.activeSessionId = session.sessionId;
    this.persist(session);
    void this.execute(session);
    return session;
  }
  private persist(session: DeepSeekHarnessSession) {
    const directory = dataDir('sessions');
    mkdirSync(directory, { recursive: true });
    const target = join(directory, session.sessionId + '.json');
    writeFileSync(target + '.tmp', JSON.stringify(session, null, 2));
    renameSync(target + '.tmp', target);
  }
  private async execute(session: DeepSeekHarnessSession) {
    try {
      const result = await runDeepSeek(session.userPrompt, { onStep: step => {
        if (step.status === 'RUNNING') session.stages.push({ id: randomUUID(), name: step.tool, department: step.department,
          assignedAgent: step.department + '_agent', status: 'ACTIVE', progress: 0, startedAt: Date.now() });
        else {
          const stage = session.stages.at(-1)!;
          stage.status = ['COMPLETED','VERIFIED'].includes(step.status) ? 'COMPLETED' : ['DRAFT','PENDING','PENDING_APPROVAL','AUTHORIZED','DISPATCHED','DRY_RUN','OFF','UNCERTAIN','PARTIAL'].includes(step.status) ? 'WAITING_APPROVAL' : 'FAILED';
          stage.progress = stage.status === 'COMPLETED' ? 100 : 0;
          stage.outputSummary = JSON.stringify(step.result);
          stage.completedAt = Date.now();
        }
        session.totalTasks = session.stages.length;
        session.completedTasks = session.stages.filter(s => s.status === 'COMPLETED').length;
        session.workingAgents = step.status === 'RUNNING' ? [step.department + '_agent'] : [];
        session.activeAgentsCount = session.workingAgents.length;
        session.currentStageIndex = Math.max(0, session.stages.length - 1);
        session.updatedAt = Date.now();
        this.persist(session);
        VisualizationEventBus.getInstance().emitEvent({ type: 'AGENT_STATE_CHANGED', agentId: step.department + '_agent',
          department: step.department, status: step.status === 'RUNNING' ? 'EXECUTING' : ['COMPLETED','VERIFIED'].includes(step.status) ? 'COMPLETED' : 'WAITING_FOR_HUMAN',
          taskId: session.sessionId, subtask: step.tool, timestamp: Date.now() });
      } });
      session.status = result.status === 'COMPLETED' ? 'COMPLETED' : result.status === 'WAITING' ? 'WAITING_HITL' : 'FAILED';
      session.hitlRequired = result.status === 'WAITING';
      session.executiveSummary = result.text;
      session.progress = session.status === 'COMPLETED' ? 100 : 0;
    } catch (error) {
      session.status = 'FAILED'; session.executiveSummary = error instanceof Error ? error.message : String(error);
    } finally {
      session.workingAgents = []; session.activeAgentsCount = 0; session.updatedAt = Date.now(); session.completedAt = Date.now();
      this.persist(session);
    }
  }
}

