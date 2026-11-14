import { VisualizationEventBus, VisualizationAgentState, HarnessEvent } from './event-bus.js';
import { OFFICES } from './office-mapper.js';

export interface AgentVisualizationState {
  agentId: string;
  name: string;
  role: string;
  department: string;
  departmentName: string;
  status: VisualizationAgentState;
  currentTaskId?: string;
  currentTaskName?: string;
  currentSubtask?: string;
  progress: number; // 0 to 100
  tool?: string;
  position: { x: number; y: number; z: number; rotationY: number };
  workstationId: string;
  history: Array<{
    timestamp: number;
    action: string;
    details?: string;
  }>;
  updatedAt: number;
}

export class AgentStateAdapter {
  private static instance: AgentStateAdapter;
  private eventBus = VisualizationEventBus.getInstance();
  private agentStates: Map<string, AgentVisualizationState> = new Map();

  private constructor() {
    this.initializeAgents();
    this.subscribeToEvents();
  }

  public static getInstance(): AgentStateAdapter {
    if (!AgentStateAdapter.instance) {
      AgentStateAdapter.instance = new AgentStateAdapter();
    }
    return AgentStateAdapter.instance;
  }

  private initializeAgents(): void {
    for (const office of OFFICES) {
      for (const ws of office.workstations) {
        this.agentStates.set(ws.agentId, {
          agentId: ws.agentId,
          name: ws.agentName,
          role: ws.role,
          department: office.id,
          departmentName: office.name,
          status: 'IDLE',
          progress: 0,
          position: { x: ws.x, y: ws.y, z: ws.z, rotationY: ws.rotationY },
          workstationId: ws.deskId,
          history: [],
          updatedAt: Date.now()
        });
      }
    }
  }

  private subscribeToEvents(): void {
    this.eventBus.on('harness_event', (event: HarnessEvent) => {
      this.handleEvent(event);
    });
  }

  public handleEvent(event: HarnessEvent): void {
    const now = Date.now();

    if (event.type === 'AGENT_STATE_CHANGED') {
      const state = this.agentStates.get(event.agentId);
      if (state) {
        state.status = event.status;
        state.updatedAt = now;
        if (event.taskId) state.currentTaskId = event.taskId;
        if (event.taskName) state.currentTaskName = event.taskName;
        if (event.subtask) state.currentSubtask = event.subtask;
        if (event.progress !== undefined) state.progress = event.progress;
        if (event.tool) state.tool = event.tool;

        state.history.unshift({
          timestamp: now,
          action: `Status changed to ${event.status}${event.subtask ? `: ${event.subtask}` : ''}`
        });
        if (state.history.length > 20) state.history.pop();
      }
    } else if (event.type === 'HITL_REQUIRED') {
      const state = this.agentStates.get(event.agentId);
      if (state) {
        state.status = 'WAITING_FOR_HUMAN';
        state.currentSubtask = `Awaiting Human Approval: ${event.title}`;
        state.updatedAt = now;
        state.history.unshift({
          timestamp: now,
          action: `HITL Approval required: ${event.title} (Level ${event.level})`
        });
      }
    } else if (event.type === 'HITL_RESOLVED') {
      const state = this.agentStates.get(event.agentId);
      if (state) {
        state.status = event.verdict === 'APPROVED' || event.verdict === 'APPROVED_WITH_PREFERENCE' ? 'EXECUTING' : 'IDLE';
        state.updatedAt = now;
        state.history.unshift({
          timestamp: now,
          action: `HITL Approval resolved: ${event.verdict}${event.feedback ? ` - "${event.feedback}"` : ''}`
        });
      }
    }
  }

  public getAgentState(agentId: string): AgentVisualizationState | undefined {
    return this.agentStates.get(agentId);
  }

  public getAllAgentsState(): AgentVisualizationState[] {
    return Array.from(this.agentStates.values());
  }

  public getDepartmentSummary(): Record<string, { total: number; working: number; idle: number; waiting: number; completed: number; hitl: number }> {
    const summary: Record<string, { total: number; working: number; idle: number; waiting: number; completed: number; hitl: number }> = {};

    for (const office of OFFICES) {
      summary[office.id] = { total: 0, working: 0, idle: 0, waiting: 0, completed: 0, hitl: 0 };
    }

    for (const agent of this.agentStates.values()) {
      const dep = summary[agent.department] || { total: 0, working: 0, idle: 0, waiting: 0, completed: 0, hitl: 0 };
      dep.total++;
      if (agent.status === 'WORKING' || agent.status === 'EXECUTING' || agent.status === 'PLANNING') {
        dep.working++;
      } else if (agent.status === 'IDLE') {
        dep.idle++;
      } else if (agent.status === 'WAITING' || agent.status === 'WAITING_FOR_AGENT') {
        dep.waiting++;
      } else if (agent.status === 'WAITING_FOR_HUMAN') {
        dep.hitl++;
      } else if (agent.status === 'COMPLETED' || agent.status === 'SUBMITTED') {
        dep.completed++;
      }
      summary[agent.department] = dep;
    }

    return summary;
  }
}

