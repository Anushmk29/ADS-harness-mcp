import { EventEmitter } from 'node:events';

export type VisualizationAgentState =
  | 'IDLE'
  | 'PLANNING'
  | 'WORKING'
  | 'EXECUTING'
  | 'WAITING'
  | 'WAITING_FOR_AGENT'
  | 'WAITING_FOR_HUMAN'
  | 'REVIEW'
  | 'COMPLETED'
  | 'SUBMITTED'
  | 'BLOCKED'
  | 'FAILED'
  | 'PAUSED';

export interface AgentVisualizationEvent {
  type: 'AGENT_STATE_CHANGED';
  agentId: string;
  department: string;
  status: VisualizationAgentState;
  taskId?: string;
  taskName?: string;
  subtask?: string;
  progress?: number;
  tool?: string;
  timestamp: number;
  details?: Record<string, any>;
}

export interface HITLEvent {
  type: 'HITL_REQUIRED' | 'HITL_RESOLVED';
  requestId: string;
  taskId: string;
  agentId: string;
  title: string;
  level: number;
  status: string;
  verdict?: string;
  feedback?: string;
  impactAssessment?: any;
  timestamp: number;
}

/** Every ads journal transition, so the console inbox and the activity timeline update live. */
export interface AdsOperationEvent {
  type: 'ADS_OPERATION_CHANGED';
  operationId: string;
  tool: string;
  status: string;
  timestamp: number;
}

export type HarnessEvent = AgentVisualizationEvent | HITLEvent | AdsOperationEvent;

export class VisualizationEventBus extends EventEmitter {
  private static instance: VisualizationEventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  public static getInstance(): VisualizationEventBus {
    if (!VisualizationEventBus.instance) {
      VisualizationEventBus.instance = new VisualizationEventBus();
    }
    return VisualizationEventBus.instance;
  }

  public emitEvent(event: HarnessEvent): void {
    this.emit('harness_event', event);
    this.emit(event.type, event);
  }
}
