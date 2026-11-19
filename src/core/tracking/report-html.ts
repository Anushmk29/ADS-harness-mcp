/**
 * Client-facing report page. Self-contained HTML (no scripts beyond print), white-labelled per client:
 * REPORT_BRAND_NAME (falls back to APP_NAME), REPORT_LOGO_URL, REPORT_ACCENT (CSS colour). PDF = the browser's Save as PDF.
 */
export interface Brand { name?: string; logoUrl?: string; accent?: string }

export function brandFromEnv(env: NodeJS.ProcessEnv = process.env): Brand {
  return { name: env.REPORT_BRAND_NAME || env.APP_NAME, logoUrl: env.REPORT_LOGO_URL, accent: env.REPORT_ACCENT };
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmt = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 100) / 100)) : '–';
const safeColour = (c?: string) => (c && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(c) ? c : '#2457d6');
const safeUrl = (u?: string) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');

export function renderReportHtml(report: any, brand: Brand = {}): string {
  const unit = report.goal === 'purchase' ? 'purchase' : 'lead';
  const t = report.totals ?? {}, cur = t.current ?? {}, prev = t.previous ?? {};
  const resultKey = unit === 'purchase' ? 'purchases' : 'leads';
  const delta = (a?: number, b?: number) => (typeof a === 'number' && typeof b === 'number' && b ? `${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}%` : '');
  const tiles: Array<[string, string, string, string?]> = [
    ['Ad spend', fmt(cur.spend), delta(cur.spend, prev.spend)],
    [unit === 'purchase' ? 'Purchases' : 'Leads', fmt(cur[resultKey]), delta(cur[resultKey], prev[resultKey])],
    [`Cost per ${unit}`, fmt(t.cpa), delta(t.cpa, t.previousCpa), report.targets?.cpa ? `target ${fmt(report.targets.cpa)}` : undefined],
    ...(unit === 'purchase' ? [['ROAS', fmt(t.roas), delta(t.roas, t.previousRoas), report.targets?.roas ? `target ${fmt(report.targets.roas)}` : undefined] as [string, string, string, string?]] : [])
  ];
  const n = report.narrative ?? { summary: report.headline, points: [] };
  const severity: Record<string, string> = { critical: 'Urgent', high: 'Important', medium: 'Worth doing', low: 'Minor', info: 'Note' };
  const title = `${report.kind === 'monthly' ? 'Monthly' : 'Weekly'} ads report`;
  const logo = safeUrl(brand.logoUrl);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(report.since)} to ${esc(report.until)}</title>
<style>
:root{--accent:${safeColour(brand.accent)};--ink:#1a1d23;--muted:#5f6673;--line:#e3e6eb;--bg:#fff;--soft:#f6f7f9}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 16px 48px}
header{display:flex;align-items:center;gap:14px;border-bottom:3px solid var(--accent);padding-bottom:14px;margin-bottom:20px}
header img{max-height:40px;max-width:160px}h1{font-size:22px;margin:0}.sub{color:var(--muted);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:18px 0}
.tile{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--soft)}
.tile .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}.tile .v{font-size:24px;font-weight:650}.tile .d{font-size:12px;color:var(--muted)}
h2{font-size:16px;margin:26px 0 8px}.summary{font-size:16px}ul{padding-left:20px}li{margin:4px 0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600;font-size:12px}td.n{text-align:right;font-variant-numeric:tabular-nums}
.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:9px;background:var(--soft);border:1px solid var(--line);margin-right:6px}
.tag.critical{background:#fde8e8;border-color:#f5b5b5}.tag.high{background:#fff3df;border-color:#f3d39b}
.note{color:var(--muted);font-size:12px;margin-top:28px}.print{float:right;font:inherit;font-size:13px;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer}
@media print{.print{display:none}main{padding:0}}
</style></head><body><main>
<button class="print" onclick="window.print()">Save as PDF</button>
<header>${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><h1>${esc(title)}${brand.name ? ` · ${esc(brand.name)}` : ''}</h1><div class="sub">${esc(report.since)} to ${esc(report.until)} · compared with the previous ${report.kind === 'monthly' ? 'month' : 'week'}</div></div></header>
<p class="summary">${esc(n.summary)}</p>
<div class="tiles">${tiles.map(([k, v, d, target]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="d">${esc([d && `${d} vs previous`, target].filter(Boolean).join(' · '))}</div></div>`).join('')}</div>
${(report.findings ?? []).length ? `<h2>What we found</h2><ul>${report.findings.map((f: any) => `<li><span class="tag ${esc(f.severity)}">${esc(severity[f.severity] ?? f.severity)}</span><strong>${esc(f.entity?.name ?? '')}</strong>: ${esc(f.message)}</li>`).join('')}</ul>` : ''}
${(report.actions ?? []).length ? `<h2>Next steps</h2><ol>${report.actions.map((a: any) => `<li>${esc(a.title)}${a.operation ? ' <span class="tag">needs your approval</span>' : a.manualStep ? ` <span class="sub">${esc(a.manualStep)}</span>` : ''}</li>`).join('')}</ol>` : ''}
${n.source === 'llm' && (n.points ?? []).length ? `<h2>In short</h2><ul>${n.points.map((p: string) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
${(report.campaigns ?? []).length ? `<h2>Spend by campaign (last 7 days)</h2><table><thead><tr><th>Campaign</th><th class="n">Spend</th><th class="n">${unit === 'purchase' ? 'Purchases' : 'Leads'}</th><th class="n">Cost per ${unit}</th>${unit === 'purchase' ? '<th class="n">Revenue</th>' : ''}</tr></thead><tbody>${report.campaigns.map((c: any) => `<tr><td>${esc(c.name)}</td><td class="n">${fmt(c.spend)}</td><td class="n">${fmt(c.results)}</td><td class="n">${fmt(c.costPerResult)}</td>${unit === 'purchase' ? `<td class="n">${fmt(c.revenue)}</td>` : ''}</tr>`).join('')}</tbody></table>` : ''}
<h2>Work done</h2><ul><li>${esc(report.work?.adChangesApplied ?? 0)} ad change(s) applied, ${esc(report.work?.adChangesDeclined ?? 0)} declined${report.work?.pendingApprovals ? `, ${esc(report.work.pendingApprovals)} waiting for approval` : ''}</li>${(report.work?.milestonesReached ?? []).map((m: string) => `<li>${esc(m)}</li>`).join('')}</ul>
<p class="note">${esc(report.dataNote ?? '')} Findings are produced by fixed rules from platform data${n.source === 'llm' ? '; wording assisted by AI and checked against the numbers' : ''}. Generated ${esc(String(report.generatedAt ?? '').slice(0, 10))}.</p>
</main></body></html>`;
}
