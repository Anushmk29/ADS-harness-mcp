import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, writeFileAtomic } from '../config/paths.js';

export interface DecisionRecord {
  id: string;
  timestamp: string;
  taskId?: string;
  missionId?: string;
  agent: string;
  question: 'WHAT_IS_HAPPENING' | 'WHY_IS_IT_HAPPENING' | 'WHAT_SHOULD_WE_DO' | 'CAN_WE_EXECUTE_AUTONOMOUSLY' | 'DID_IT_WORK' | 'WHAT_DID_WE_LEARN';
  summary: string;
  evidence: Record<string, any>;
  inputs: Record<string, any>;
  actionsTaken: string[];
  expectedImpact: string;
  actualImpact?: string;
  confidenceScore: number;
}

export class AuditTrail {
  private static instance: AuditTrail;
  private records: DecisionRecord[] = [];
  private logFilePath: string;

  private constructor() {
    const memoryDir = dataDir();
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    this.logFilePath = path.join(memoryDir, 'decision-audit-trail.json');
    this.loadPersistedRecords();
  }

  public static getInstance(): AuditTrail {
    if (!AuditTrail.instance) {
      AuditTrail.instance = new AuditTrail();
    }
    return AuditTrail.instance;
  }

  private loadPersistedRecords(): void {
    if (fs.existsSync(this.logFilePath)) {
      try {
        const raw = fs.readFileSync(this.logFilePath, 'utf8');
        this.records = JSON.parse(raw);
      } catch (e) {
        this.records = [];
      }
    }
  }

  private persist(): void {
    try {
      writeFileAtomic(this.logFilePath, JSON.stringify(this.records, null, 2));
    } catch (e) {
      console.error('[AuditTrail] Failed to persist audit trail:', e);
    }
  }

  public recordDecision(decision: Omit<DecisionRecord, 'id' | 'timestamp'>): DecisionRecord {
    const record: DecisionRecord = {
      id: `dec_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      ...decision
    };

    this.records.push(record);
    this.persist();
    return record;
  }

  public getRecentDecisions(limit = 50): DecisionRecord[] {
    return this.records.slice(-limit);
  }
}
