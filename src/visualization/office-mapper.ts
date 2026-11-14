export interface WorkstationPosition {
  deskId: string;
  agentId: string;
  agentName: string;
  role: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  isCustom?: boolean;
}

export interface DepartmentLayout {
  id: string;
  name: string;
  description: string;
  color: string; // hex
  accentColor: string; // hex
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  center: { x: number; y: number; z: number };
  workstations: WorkstationPosition[];
  specialZones?: Array<{
    id: string;
    name: string;
    type: 'HITL_ROOM' | 'MEMORY_CORE' | 'CONFERENCE_TABLE' | 'SERVER_RACK' | 'SUBMISSION_DESK';
    x: number;
    y: number;
    z: number;
    width: number;
    depth: number;
  }>;
}

export const OFFICES: DepartmentLayout[] = [
  // 1. Central Marketing HQ
  {
    id: 'hq',
    name: 'Marketing HQ',
    description: 'Central orchestrator, task routing, learning memory core, and human approval governance.',
    color: '#1e293b',
    accentColor: '#38bdf8',
    bounds: { minX: -12, maxX: 12, minZ: -10, maxZ: 10 },
    center: { x: 0, y: 0, z: 0 },
    specialZones: [
      {
        id: 'hitl_room',
        name: 'Human-in-the-Loop Review Room',
        type: 'HITL_ROOM',
        x: 6,
        y: 0,
        z: 4,
        width: 8,
        depth: 6
      },
      {
        id: 'memory_core',
        name: 'Organization Memory Core',
        type: 'MEMORY_CORE',
        x: -6,
        y: 0,
        z: -5,
        width: 7,
        depth: 5
      },
      {
        id: 'conference_table',
        name: 'Executive Strategy Table',
        type: 'CONFERENCE_TABLE',
        x: 0,
        y: 0,
        z: 0,
        width: 6,
        depth: 4
      }
    ],
    workstations: [
      {
        deskId: 'desk_orchestrator',
        agentId: 'marketing_orchestrator',
        agentName: 'Marketing Orchestrator',
        role: 'Autonomous Loop Commander & Mission Decomposer',
        x: 0,
        y: 0,
        z: -6,
        rotationY: 0
      },
      {
        deskId: 'desk_learning',
        agentId: 'learning_engine',
        agentName: 'Learning & Feedback Agent',
        role: 'Pattern Detector & Continuous Strategy Evolver',
        x: -4,
        y: 0,
        z: -2,
        rotationY: Math.PI / 2
      },
      {
        deskId: 'desk_hitl_agent',
        agentId: 'hitl_manager',
        agentName: 'HITL Gatekeeper Agent',
        role: 'Human-in-the-Loop Review Manager & Preference Converter',
        x: 7,
        y: 0,
        z: 4,
        rotationY: -Math.PI / 2
      }
    ]
  },

  // 2. Ads Office
  {
    id: 'ads',
    name: 'Paid Advertising Office',
    description: 'Meta, Google, creative fatigue analysis, Andromeda entity clustering, and negative query harvesting.',
    color: '#1e1b4b',
    accentColor: '#818cf8',
    bounds: { minX: 16, maxX: 40, minZ: -10, maxZ: 14 },
    center: { x: 28, y: 0, z: 2 },
    workstations: [
      {
        deskId: 'desk_meta_ads',
        agentId: 'meta_ads_agent',
        agentName: 'Meta Ads Agent',
        role: '7-Day CTR Decay Monitoring & Creative Variation Deployer',
        x: 22,
        y: 0,
        z: -4,
        rotationY: 0
      },
      {
        deskId: 'desk_google_ads',
        agentId: 'google_ads_agent',
        agentName: 'Google Ads Agent',
        role: 'High-Intent Query Harvester & Negative Keyword Pruner',
        x: 28,
        y: 0,
        z: -4,
        rotationY: 0
      },
      {
        deskId: 'desk_ad_creative',
        agentId: 'ad_creative_agent',
        agentName: 'Ad Creative Agent',
        role: 'High-Diversity Ad Angle Generator & Visual Hook Crafter',
        x: 34,
        y: 0,
        z: -4,
        rotationY: 0
      },
      {
        deskId: 'desk_budget_monitor',
        agentId: 'budget_monitoring_agent',
        agentName: 'Budget Monitoring Agent',
        role: 'Real-Time Ad Spend & Margin Protection Monitor',
        x: 25,
        y: 0,
        z: 6,
        rotationY: Math.PI
      },
      {
        deskId: 'desk_campaign_opt',
        agentId: 'campaign_optimization_agent',
        agentName: 'Campaign Optimization Agent',
        role: 'Multi-Channel Budget Rebalancer',
        x: 31,
        y: 0,
        z: 6,
        rotationY: Math.PI
      }
    ]
  },

  // 3. Analytics Office
  {
    id: 'analytics',
    name: 'Analytics & Attribution Office',
    description: 'GA4 telemetry, funnel drop-off diagnostics, multi-touch attribution, and CRO experiments.',
    color: '#064e3b',
    accentColor: '#34d399',
    bounds: { minX: -40, maxX: -16, minZ: -10, maxZ: 14 },
    center: { x: -28, y: 0, z: 2 },
    workstations: [
      {
        deskId: 'desk_ga4',
        agentId: 'ga4_intelligence_agent',
        agentName: 'GA4 Intelligence Agent',
        role: 'Event Stream Analytics & Behavioral Anomaly Detector',
        x: -22,
        y: 0,
        z: -4,
        rotationY: 0
      },
      {
        deskId: 'desk_cro',
        agentId: 'cro_agent',
        agentName: 'CRO Experimentation Agent',
        role: 'Landing Page Funnel & Hypothesis Test Designer',
        x: -28,
        y: 0,
        z: -4,
        rotationY: 0
      },
      {
        deskId: 'desk_reporting',
        agentId: 'reporting_agent',
        agentName: 'Executive Reporting Agent',
        role: 'Closed-Loop ROI & KPI Dashboard Synthesizer',
        x: -34,
        y: 0,
        z: -4,
        rotationY: 0
      },
      {
        deskId: 'desk_attribution',
        agentId: 'attribution_agent',
        agentName: 'Attribution Agent',
        role: 'Multi-Touch Journey & Knowledge Graph Attribution',
        x: -25,
        y: 0,
        z: 6,
        rotationY: Math.PI
      },
      {
        deskId: 'desk_kpi',
        agentId: 'kpi_agent',
        agentName: 'KPI Velocity Agent',
        role: 'CAC, CPQL & Revenue Velocity Tracker',
        x: -31,
        y: 0,
        z: 6,
        rotationY: Math.PI
      }
    ]
  },

  // 4. Research & Intelligence Office
  {
    id: 'research',
    name: 'Market Intelligence & Strategy Office',
    description: 'Competitor positioning, ICP evolving triggers, market intent research, and dynamic strategy.',
    color: '#0f766e',
    accentColor: '#2dd4bf',
    bounds: { minX: -40, maxX: -16, minZ: -38, maxZ: -14 },
    center: { x: -28, y: 0, z: -26 },
    workstations: [
      {
        deskId: 'desk_competitor',
        agentId: 'competitor_intelligence_agent',
        agentName: 'Competitor Intelligence Agent',
        role: 'Competitor Ad Copy, Pricing & Value Gap Spy',
        x: -22,
        y: 0,
        z: -28,
        rotationY: Math.PI
      },
      {
        deskId: 'desk_customer',
        agentId: 'customer_intelligence_agent',
        agentName: 'Customer Intelligence Agent',
        role: 'Persona ICP Definition & Buying Trigger Synthesizer',
        x: -28,
        y: 0,
        z: -28,
        rotationY: Math.PI
      },
      {
        deskId: 'desk_biz_intel',
        agentId: 'business_intelligence_agent',
        agentName: 'Business Intelligence Agent',
        role: 'Unit Economics & Market Positioning Analyst',
        x: -34,
        y: 0,
        z: -28,
        rotationY: Math.PI
      },
      {
        deskId: 'desk_strategy',
        agentId: 'strategy_agent',
        agentName: 'Strategy Agent',
        role: 'Cross-Channel Playbook Architect & Hypothesis Formulator',
        x: -28,
        y: 0,
        z: -34,
        rotationY: 0
      }
    ]
  }
];
