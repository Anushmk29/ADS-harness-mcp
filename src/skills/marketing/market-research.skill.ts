import { SkillDefinition } from '../skill-types.js';
import { LayaClient } from '../../core/decision/laya-client.js';

export const marketResearchSkill: SkillDefinition = {
  id: 'skill_market_research',
  name: 'Market & Intent Research Skill',
  description: 'Gathers SERP search intent, ICP pain points, and current market trends using web research MCP tools and Laya System 1 validation.',
  execute: async (ctx) => {
    const keyword = ctx.inputData.keyword || 'b2b marketing attribution ai';
    const serpData = await ctx.mcp.callTool('research_serp_intent_cluster', { keyword });
    const personas = ctx.memory.customer.getAllPersonas();

    // Laya System 1 Verification: Classify intent and filter noise (<35ms)
    const laya = LayaClient.getInstance();
    const layaVerification = await laya.filterResearchRelevance(
      `${keyword}. Content gaps: ${(serpData.contentGapsIdentified || []).join(', ')}`,
      'B2B AI Automation'
    );

    return {
      targetKeyword: keyword,
      searchIntent: layaVerification.intent || serpData.searchIntent,
      verifiedByLaya: layaVerification.isRelevant,
      layaConfidence: layaVerification.confidence,
      recommendedPillarTitle: serpData.recommendedPillarTitle,
      contentGaps: serpData.contentGapsIdentified,
      targetPersonas: personas.map(p => p.title),
      insightsSummary: `Identified high-intent ${layaVerification.intent} keyword cluster around "${keyword}" with opportunity to outrank generic competitors using deep architectural teardowns.`
    };
  }
};

export const competitorAnalysisSkill: SkillDefinition = {
  id: 'skill_competitor_analysis',
  name: 'Competitor Ad & Strategy Intelligence Skill',
  description: 'Inspects competitor ad messaging, identifies creative gaps, and generates differentiated positioning angles with Laya verification.',
  execute: async (ctx) => {
    const competitorDomain = ctx.inputData.competitorDomain || 'legacycompetitor.com';
    const compData = await ctx.mcp.callTool('research_competitor_ad_library', { competitorDomain });

    // Laya System 1 Verification: Verify competitor ad angle differentiation
    const laya = LayaClient.getInstance();
    const layaVerification = await laya.filterResearchRelevance(
      `Competitor: ${competitorDomain}. Angles: ${(compData.adAnglesObserved || []).join(' | ')}`,
      'B2B Competitive Intelligence'
    );

    return {
      competitorDomain,
      activeCompetitorAds: compData.activeAdsFound,
      observedAngles: compData.adAnglesObserved,
      competitorWeaknesses: compData.weaknessesAndGaps,
      recommendedCounterAngle: compData.recommendedCounterAngle,
      verifiedByLaya: layaVerification.isRelevant,
      layaConfidence: layaVerification.confidence,
      positioningAdvantage: 'Emphasize engineering-grade pipeline math and deterministic CRM attribution over black-box AI hype.'
    };
  }
};
