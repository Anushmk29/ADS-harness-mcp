/**
 * Core Types & Schema Definitions for Autonomous Marketing Harness
 */

export type AutonomyLevel = 0 | 1 | 2 | 3;

export interface TaskEvaluation {
  passed: boolean;
  score: number; // 0 to 100
  originalityScore?: number;
  brandAlignmentScore?: number;
  policyComplianceScore?: number;
  feasibilityScore?: number;
  issues: string[];
  recommendations: string[];
  evaluatedBy: string;
  timestamp: number;
}

export type { BusinessConfig } from '../config/config-loader.js';

export interface HumanApprovalRequest {
  id: string;
  taskId: string;
  title: string;
  description: string;
  level: AutonomyLevel;
  proposedAction: string;
  impactAssessment: {
    budgetImpactUSD?: number;
    channel?: string;
    audienceScope?: string;
    riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  payload: any;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED' | 'APPROVED_WITH_PREFERENCE';
  feedback?: string;
  extractedPreferenceRule?: StructuredPreferenceRule;
  createdAt: number;
  resolvedAt?: number;
}

export interface StructuredPreferenceRule {
  id: string;
  type: 'brand_preference' | 'creative_preference' | 'audience_rule' | 'channel_rule' | 'budget_rule' | 'tone_rule';
  category: string;
  preference: string;
  avoid: string[];
  enforce: string[];
  source: 'human_feedback' | 'performance_learning' | 'failure_analysis';
  confidence: number;
  active: boolean;
  createdAt: number;
}
