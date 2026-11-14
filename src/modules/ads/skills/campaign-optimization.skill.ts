import { SkillDefinition } from '../../../skills/skill-types.js';
import { z } from 'zod';

export const campaignOptimizationSkill: SkillDefinition = {
  id: 'skill_campaign_optimization', name: 'Execute Explicit Campaign Changes',
  description: 'Execute an explicit list of campaign operations through the shared tool gate.',
  execute: async ctx => {
    const operations = z.array(z.object({ tool: z.string().regex(/^(meta_ads_|google_ads_)/), args: z.record(z.unknown()) }).strict()).max(50).parse(ctx.inputData.operations ?? []);
    if (!operations.length) return { status: 'PENDING', success: false, reason: 'Supply explicit campaign operations with account IDs and evidence; no default campaign changes are inferred.' };
    const results = [];
    for (const operation of operations) {
      const result = await ctx.mcp.callTool(operation.tool, operation.args);
      results.push({ tool: operation.tool, result });
      if (result.status && result.status !== 'COMPLETED') return { status: result.status, success: false, results };
      if (result.success === false) return { status: 'FAILED', success: false, results };
    }
    return { status: 'COMPLETED', success: true, results };
  }
};

export const ga4AnalysisSkill: SkillDefinition = {
  id: 'skill_ga4_analysis',
  name: 'GA4 Funnel & Behavioral Diagnostics Skill',
  description: 'Diagnoses behavioral anomalies, mobile/desktop conversion friction, and channel attribution.',
  execute: async (ctx) => {
    const funnel = await ctx.mcp.callTool('ga4_get_funnel_metrics', ctx.inputData);
    const attribution = await ctx.mcp.callTool('ga4_get_channel_attribution', ctx.inputData);

    return {
      trafficSummary: funnel.trafficSummary,
      funnelDropoffs: funnel.funnelStages,
      topLandingPages: funnel.topLandingPages,
      detectedAnomaly: funnel.detectedAnomaly,
      attributionHighlights: attribution.channelContributions,
      recommendedCROAction: null,
      caveat: 'A channel report alone does not establish form friction or a causal CRO recommendation.'
    };
  }
};

export const performanceReportingSkill: SkillDefinition = {
  id: 'skill_performance_reporting',
  name: 'Executive Performance & Learning Report Skill',
  description: 'Synthesizes executive marketing metrics, ROI, channel breakdowns, and "What did we learn?".',
  execute: async (ctx) => {
    const googleData = await ctx.mcp.callTool('google_ads_get_campaign_performance', ctx.inputData.google ?? ctx.inputData);
    const metaData = await ctx.mcp.callTool('meta_ads_get_performance_and_fatigue', ctx.inputData.meta ?? ctx.inputData);
    const currency = googleData.currency;
    if (!/^[A-Z]{3}$/.test(currency ?? '') || metaData.currency !== currency) throw new Error('Reports require matching, confirmed account currencies; normalize amounts before combining them');

    const googleSpend = (googleData.campaigns || []).reduce((sum: number, campaign: any) => sum + Number(campaign.spend || 0), 0);
    const totalSpend = googleSpend + (metaData.accountSummary?.spend || 0);
    const googleConversions = (googleData.campaigns || []).reduce((sum: number, c: any) => sum + Number(c.conversions || 0), 0);
    const metaLeadCount = metaData.accountSummary?.leads;
    if (!Number.isFinite(metaLeadCount)) throw new Error('Meta report omitted its lead count');

    const learnedRules = ctx.memory.feedback.getActiveRules();
    const learnings = ctx.memory.learnings.list({ minConfidence: 'emerging' });

    return {
      executiveSummary: {
        currency,
        totalMarketingSpend: totalSpend,
        googleConversions,
        metaLeads: metaLeadCount,
        totalConversions: null,
        costPerConversion: null,
        overallROAS: null,
        caveat: 'Google conversions and Meta leads use different definitions; counts are reported separately. Business totals and ROAS require attribution deduplication.'
      },
      channelEfficiency: [
        { channel: 'Google Ads', currency, spend: googleSpend, conversions: googleConversions, status: 'REQUIRES_ANALYSIS' },
        { channel: 'Meta Ads', currency, spend: metaData.accountSummary?.spend || 0, leads: metaLeadCount, status: 'REQUIRES_ANALYSIS' }
      ],
      aiLearningAndEvolution: {
        activeLearnedRulesCount: learnedRules.length,
        recentFeedbackPreferences: learnedRules.map(r => r.preference),
        recordedLearnings: learnings.map(l => ({ id: l.id, pattern: l.pattern, confidence: l.confidence })),
        strategicDirectionForNextCycle: null
      }
    };
  }
};
