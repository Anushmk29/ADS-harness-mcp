# Where the knowledge came from

**For:** people maintaining `knowledge/`. Models don't need this page to do a task.

This is the update record. To refresh a page from upstream, find its source here, compare the upstream version against the "Taken" column, and update the page. Then add a line to `CHANGELOG.md`. Every new file needs a row in `README.md` (the router), and a test fails if the router names a file that doesn't exist.

| Folder / pages | Source | Taken | Licence | What we took | Skipped |
|---|---|---|---|---|---|
| `ads/our-business-fit.md` | Team-written | — | Ours | Our decisions, including the conflict table (DRAFT) | — |
| `ads/meta-*.md` | Team's Meta research (was `src/modules/ads/playbook`) | 2026-09 | Ours | As written; adapted by `our-business-fit` | — |
| `ads/{google-audit-checklist,meta-audit-checklist,ppc-math,competitor-intel,creative-and-copy,b2b-paid-playbook,report-template}.md` | `ads-expert` skill, local copy at `D:\Autonoetic_edge\Vijendra pratap\ads expert\ads-expert` | 2026-09-30 | MIT (per its SKILL.md) | Reference pages, links renamed | `business-profile.md` (replaced by `config/business.yaml`); the Facebook Ad Library MCP (didn't work: dummy token, no commercial spend data) |
| `creative/**` | "marketing-harness-skills" bundle (shared as a zip); each `creative/sources/*` folder lists its own origins | 2026-09-30 | Mixed; see each `creative/sources/*` folder | The ad-related part of the bundle (2026-10-13: organic/social sources removed) | Organic content, LinkedIn, social and video-editing sources |
| `ops/diagnose.md`, `ops/review-panel.md`, `ops/learning-loop.md` | [show-me-the-money](https://github.com/iamzifei/show-me-the-money) by 在悉尼和稀泥 (@JamesAI) | commit `b1e2f9e` (2026-09-01) | CC BY-NC 4.0 | **Methods only, rewritten in our own words for B2B lead generation:** diagnose gate (money-diagnose); review-panel scoring with our own personas (money-panel); learnings confidence model and retro (money-learn, money-retro). The spend guardrails in `our-business-fit` come from money-ops. | Everything SaaS, VC or China-market; the atom corpus; money-ads/seo/social/finance (our pages and tools cover these); their installer and upgrade scripts. **No text was copied.** |
## Licence note on show-me-the-money
Its text is CC BY-NC 4.0, and its author sells an OEM licence for use inside a paid product or service. We copied no text; the pages above are our own writing based on its methods, credited in `NOTICE.md`. If this harness is ever run as a paid service for clients, read their `COMMERCIAL-LICENSE.md` before pulling in any of their text.
