import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillDefinition } from '../skill-types.js';

// All guidance markdown lives in knowledge/ at the repo root; resolves from both src/ and dist/.
export const knowledgeRoot = fileURLToPath(new URL('../../../knowledge/', import.meta.url));

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? listFiles(join(dir, entry.name))
    : [relative(knowledgeRoot, join(dir, entry.name)).split(sep).join('/')]);
}

export function readKnowledge(path?: string) {
  if (!path) return { router: readFileSync(join(knowledgeRoot, 'README.md'), 'utf8'), files: listFiles(knowledgeRoot).filter(file => file !== 'README.md') };
  const full = resolve(knowledgeRoot, path);
  if (relative(knowledgeRoot, full).startsWith('..') || !statSync(full, { throwIfNoEntry: false })?.isFile()) throw new Error('Unknown knowledge file; call without path for the router and file list');
  return { path, content: readFileSync(full, 'utf8') };
}

export const knowledgeSkill: SkillDefinition = {
  id: 'skill_knowledge',
  name: 'Marketing Knowledge',
  description: 'The only source of marketing guidance (ads playbook, audit checklists, PPC math, creative/copy pipeline, frameworks, hooks). Call with no input FIRST on any ads or creative task: it returns the router (which files to read for which task, which rule wins when files disagree) and the file list. Then call with input.path (relative to knowledge/, e.g. "ads/ppc-math.md") for each file the router names. Guidance only, never account evidence.',
  inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Relative to knowledge/; omit for the router and file list' } }, additionalProperties: false },
  execute: async ctx => readKnowledge(ctx.inputData.path)
};
