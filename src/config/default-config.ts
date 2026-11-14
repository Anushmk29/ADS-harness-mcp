import { BusinessConfig } from '../types/index.js';

export const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  business: {
    id: 'biz_apexscale_01',
    name: 'Pratap AI Innovations',
    industry: 'B2B SaaS / Enterprise AI Marketing Infrastructure',
    website: 'https://apexscale.ai',
    description: 'Autonomous AI engine providing end-to-end multi-channel marketing, revenue attribution, and real-time conversion optimization for mid-market and enterprise B2B software companies.',
    products: [
      {
        id: 'prod_core_engine',
        name: 'Front Desk — WhatsApp Agentic Automation',
        category: 'Software Platform',
        pricing: { model: 'monthly_subscription', amount: 4999, currency: 'USD' },
        valueProposition: 'Replace fragmented marketing point-solutions with an autonomous learning marketing engine that continuously generates qualified pipeline with zero hallucination.',
        differentiators: [
          'Deterministic closed-loop attribution with GA4 and CRM integration',
          'Anti-AI-slop content differentiation engine with semantic identity graphs',
          'Autonomous multi-channel ad fatigue detection and budget rebalancing',
          'Strict Human-in-the-Loop guardrails for brand-sensitive actions'
        ],
        marginsPercent: 82,
        targetAudienceId: 'aud_b2b_saas_cmo'
      },
      {
        id: 'prod_enterprise_custom',
        name: 'Custom AI Workflow Systems',
        category: 'Custom Enterprise Deployment',
        pricing: { model: 'annual_contract', amount: 75000, currency: 'USD' },
        valueProposition: 'Custom on-premise/VPC AI marketing intelligence harness with dedicated SLA, proprietary model fine-tuning, and direct ERP/Data Warehouse data pipelines.',
        differentiators: [
          'Zero data egress / SOC2 Type II VPC deployment',
          'Custom capability registry with proprietary internal tooling'
        ],
        marginsPercent: 78,
        targetAudienceId: 'aud_enterprise_vp_growth'
      }
    ],
    services: [
      {
        id: 'srv_onboarding',
        name: 'White-glove Marketing Knowledge Graph Onboarding',
        pricingModel: 'included_with_annual',
        targetAudienceId: 'aud_b2b_saas_cmo'
      }
    ],
    targetMarket: [
      'B2B SaaS companies ($5M - $100M ARR)',
      'Enterprise Technology & Cloud Services Providers',
      'High-growth Fintech & Developer Tool companies'
    ],
    geography: ['North America', 'Western Europe', 'ANZ'],
    businessModel: 'B2B_SAAS',
    salesCycleDays: 45,
    avgCustomerLTV: 60000,
    currentCAC: 5200,
    targetCAC: 3500
  },
  brand: {
    voice: 'Authoritative, analytical, direct, engineering-grounded, and results-obsessed. Avoids hype, generic buzzwords, and vague promises.',
    tone: [
      'Insightful & rigorous',
      'Practical & data-backed',
      'Empathetic to B2B marketing leaders facing CAC inflation',
      'Confident yet pragmatic'
    ],
    positioning: 'The only autonomous marketing operating system engineered from the ground up for pipeline math and verified ROI.',
    bannedPhrases: [
      'In today’s fast-paced digital landscape',
      'Unleash the power of AI',
      'Game changer',
      'Revolutionize your business',
      'Silver bullet',
      'Magic wand',
      'Skyrocket your growth',
      'Next-gen synergy',
      'Look no further'
    ],
    preferredPhrases: [
      'Measurable pipeline velocity',
      'Deterministic attribution',
      'Cost-per-qualified-lead (CPQL)',
      'Autonomous optimization loops',
      'Zero-slop content architecture',
      'CAC payback compression',
      'Data-backed hypothesis testing'
    ],
    valuePillars: [
      'Engineering Rigor in Marketing Execution',
      'Radical Transparency & Explainable Attribution',
      'Continuous Learning from Ground-Truth Performance Data',
      'Hyper-Personalization Without AI Hallucinations'
    ],
    messagingRules: [
      'Always substantiate claims with quantifiable operational metrics or testable hypotheses.',
      'Never produce generic marketing platitudes or cookie-cutter listicles.',
      'Tie top-of-funnel initiatives directly to pipeline and revenue impact.'
    ]
  },
  marketing: {
    objectives: [
      'Increase Qualified Leads (MQL to SQL conversion) by 30% over 90 days',
      'Reduce blended Paid CAC from $5,200 to below $3,800',
      'Achieve a 4.2x ROAS across Google Search and Meta Ads campaigns'
    ],
    primaryKPIs: {
      monthlyQualifiedLeads: 120,
      targetBlendedCAC: 3800,
      mqlToSqlRatePercent: 32,
      targetROAS: 4.2
    },
    secondaryKPIs: {
      emailNurtureClickToMeetingRatePercent: 8.5,
      metaAdCTRPercent: 2.1,
      googleSearchImpressionSharePercent: 65
    },
    monthlyBudget: {
      total: 14500,
      currency: 'USD',
      allocations: {
        google_ads: 7000,
        meta_ads: 5500,
        email_and_crm_tools: 2000
      }
    },
    channels: [
      'google_ads',
      'meta_ads',
      'email_nurture',
      'abm_outreach'
    ]
  }
};
