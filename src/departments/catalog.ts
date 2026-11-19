import type { SkillDefinition } from '../skills/skill-types.js';

export const departmentIds = ['hq', 'research', 'ads', 'analytics'] as const;
export type DepartmentId = typeof departmentIds[number];
// shared: listed and runnable in every department (reference material, not work).
export type SkillEntry = { department: DepartmentId; shared?: boolean; load: () => Promise<SkillDefinition> };

export const skillCatalog: Record<string, SkillEntry> = {
  skill_knowledge: { department: 'research', shared: true, load: async () => (await import('../skills/marketing/knowledge.skill.js')).knowledgeSkill },
  skill_learnings: { department: 'analytics', shared: true, load: async () => (await import('../skills/marketing/learnings.skill.js')).learningsSkill },
  skill_competitor_ads: { department: 'research', load: async () => (await import('../skills/marketing/competitor-ads.skill.js')).competitorAdsSkill },
  // Alias kept for the mission and older callers; same report as skill_performance_reporting.
  skill_campaign_analysis: { department: 'analytics', load: async () => (await import('../modules/ads/skills/campaign-optimization.skill.js')).performanceReportingSkill },
  skill_campaign_optimization: { department: 'ads', load: async () => (await import('../modules/ads/skills/campaign-optimization.skill.js')).campaignOptimizationSkill },
  skill_ga4_analysis: { department: 'analytics', load: async () => (await import('../modules/ads/skills/campaign-optimization.skill.js')).ga4AnalysisSkill },
  skill_performance_reporting: { department: 'analytics', load: async () => (await import('../modules/ads/skills/campaign-optimization.skill.js')).performanceReportingSkill },
};

const toolOwners: Record<string, DepartmentId> = {
  meta_ads_: 'ads', meta_mcp_: 'ads', google_ads_: 'ads', ads_: 'ads', ga4_: 'analytics',
  research_: 'research'
};
export function toolDepartment(name: string): DepartmentId | undefined {
  return Object.entries(toolOwners).find(([prefix]) => name.startsWith(prefix))?.[1];
}
