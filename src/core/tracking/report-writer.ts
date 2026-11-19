import { chat as defaultChat, type ChatRequest, type ChatResult } from '../llm/index.js';
import { logger } from '../../observability/logger.js';

/**
 * Report wording. Code decides every number and finding; the model (if any) only rephrases them.
 * The template version always exists, so a report never depends on an LLM being up, funded or honest.
 */
export interface Narrative { summary: string; points: string[]; source: 'template' | 'llm'; model?: string; rejected?: string }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function templateNarrative(report: any): Narrative {
  const unit = report.goal === 'purchase' ? 'purchase' : 'lead';
  const t = report.totals ?? {}, targets = report.targets ?? {};
  const parts: string[] = [];
  if (report.headline) parts.push(`${report.headline}.`);
  if (t.cpa != null && targets.cpa) parts.push(t.cpa <= targets.cpa ? `Cost per ${unit} (${r2(t.cpa)}) is within the ${targets.cpa} target.` : `Cost per ${unit} (${r2(t.cpa)}) is above the ${targets.cpa} target.`);
  if (report.goal === 'purchase' && t.roas != null && targets.roas) parts.push(t.roas >= targets.roas ? `ROAS (${r2(t.roas)}) meets the ${targets.roas} target.` : `ROAS (${r2(t.roas)}) is below the ${targets.roas} target.`);
  const findings: any[] = report.findings ?? [], actions: any[] = report.actions ?? [];
  const critical = findings.filter(f => f.severity === 'critical').length;
  if (findings.length) parts.push(critical ? `${critical} urgent issue(s) found this period; details and next steps below.` : `No urgent issues; ${findings.length} point(s) to act on below.`);
  else if (report.dataStatus === 'INSUFFICIENT') parts.push(`Not enough ${unit}s yet to judge costs reliably; we keep collecting data.`);
  const points = [
    ...findings.slice(0, 5).map(f => `${f.entity?.name ? `${f.entity.name}: ` : ''}${f.message}`),
    ...actions.slice(0, 3).map(a => `Next: ${a.title}${a.operation ? ' (waiting for your approval)' : ''}.`)
  ];
  return { summary: parts.join(' '), points, source: 'template' };
}

/** Every number the model may use: all numbers in the facts, plus their rounded forms. */
export function allowedNumbers(facts: unknown): Set<string> {
  const allowed = new Set<string>();
  const addNum = (n: number) => { for (const v of [n, Math.round(n), r2(n), Math.round(n * 10) / 10, Math.abs(n)]) allowed.add(String(v)); };
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) addNum(v);
    else if (typeof v === 'string') for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) addNum(Number(m));
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(facts);
  for (let i = 0; i <= 10; i++) allowed.add(String(i)); // counting words ("3 ads", "top 5")
  return allowed;
}

/** Numbers in `text` that are not in `allowed` (thousands separators and % ignored). */
export function inventedNumbers(text: string, allowed: Set<string>): string[] {
  return (text.replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).filter(n => !allowed.has(String(Number(n))));
}

type Chat = (request: ChatRequest) => Promise<ChatResult>;

export async function writeNarrative(report: any, options: { chat?: Chat; businessName?: string } = {}): Promise<Narrative> {
  const fallback = templateNarrative(report);
  const facts = {
    business: options.businessName, period: { since: report.since, until: report.until }, goal: report.goal, targets: report.targets,
    headline: report.headline, totals: report.totals, findings: (report.findings ?? []).slice(0, 5).map((f: any) => ({ severity: f.severity, about: f.entity?.name, fact: f.message })),
    nextActions: (report.actions ?? []).slice(0, 5).map((a: any) => ({ title: a.title, needsApproval: Boolean(a.operation) })), work: report.work, dataNote: report.dataNote
  };
  try {
    const result = await (options.chat ?? defaultChat)({
      purpose: 'report-narrative', json: true, timeoutMs: 60_000,
      messages: [
        { role: 'system', content: 'You write the summary of a paid-ads report for a busy small-business owner. Plain English, no jargon, no hype. Use ONLY the facts given; never add, estimate or recompute a number. Return JSON: {"summary": "2-3 sentences: how the period went against target and the one thing that matters most", "points": ["max 6 short sentences: each finding in plain words and what happens next"]}' },
        { role: 'user', content: JSON.stringify(facts) }
      ]
    });
    const parsed = JSON.parse(String(result.message?.content ?? ''));
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const points = Array.isArray(parsed.points) ? parsed.points.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 6) : [];
    if (!summary) return { ...fallback, rejected: 'empty summary' };
    const invented = inventedNumbers([summary, ...points].join(' '), allowedNumbers(facts));
    if (invented.length) {
      logger.warn('Report', `model wording rejected; numbers not in the data: ${invented.join(', ')}`);
      return { ...fallback, rejected: `numbers not in the data: ${invented.join(', ')}` };
    }
    return { summary, points, source: 'llm', model: `${result.provider}/${result.model}` };
  } catch (e: any) {
    return { ...fallback, rejected: e.message };
  }
}
