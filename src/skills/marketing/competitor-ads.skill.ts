import { z } from 'zod';
import type { SkillDefinition } from '../skill-types.js';
import { researchCompetitor } from '../../modules/research/competitors.js';

const input = z.object({
  name: z.string().min(1).max(100), query: z.string().min(1).max(100).optional(), pageId: z.string().regex(/^\d+$/).optional(),
  country: z.string().regex(/^[A-Z]{2}$|^ALL$/).default('ALL'), limit: z.number().int().min(5).max(200).default(50)
}).strict();

export const competitorAdsSkill: SkillDefinition = {
  id: 'skill_competitor_ads',
  name: 'Competitor Ads (Meta Ad Library)',
  description: 'Fetch a competitor\'s real ads from the Meta Ad Library (needs COMPETITOR_API_KEY): longest-running ads, format mix, CTAs, offers, new ads since the last snapshot, and model-named angles that cite ad IDs.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['name'], properties: {
    name: { type: 'string', description: 'Competitor name; used as the search query unless query or pageId is given' },
    query: { type: 'string' }, pageId: { type: 'string', description: 'Facebook Page ID: exact, preferred over a keyword search' },
    country: { type: 'string', description: 'Two-letter country code or ALL' }, limit: { type: 'integer', minimum: 5, maximum: 200 } } },
  execute: async ctx => {
    const { limit, ...competitor } = input.parse(ctx.inputData);
    return researchCompetitor(competitor, { limit });
  }
};
