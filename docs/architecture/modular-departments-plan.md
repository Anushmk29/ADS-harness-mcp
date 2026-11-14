# Modular marketing departments

Date: 2026-09-23. Status: modular runtime implemented; this document preserves the broader design. See [current setup, coverage and remaining work](../guides/departments-quickstart.md). Non-ads live connectors are not made production-ready by the module refactor.

## Goal

Every department in the marketing harness is an independently usable module. The harness loads a department only when a task or an explicitly scheduled job needs one of its capabilities. A department can run directly without starting the marketing headquarters or other departments. Cross-department missions compose the same modules through the harness.

Ads follows this common rule. Its full capability roadmap remains in [the ads build plan](../ads/ads-department-build-plan.md).

## Department boundaries

The office layout currently names eight departments. Use these IDs as the initial public names, but treat executable capabilities as the source of truth; a workstation in the 3D office does not prove an agent exists.

| Module | Owns | Collaborates through declared inputs/results |
|---|---|---|
| `research` | Business, customer, competitor and market research; strategy evidence | Ads, content, blog, email and social request briefs or evidence |
| `content` | SEO planning, content strategy and brand/content review | Blog and social consume approved briefs or review results |
| `blog` | Long-form drafts, articles and CMS publishing workflows | Content supplies briefs/review; CMS connection loads only for publication |
| `email` | Email lifecycle, lead nurture and CRM workflows | Research/customer context and qualified-lead events |
| `social` | Organic social and LinkedIn writing, repurposing and engagement workflows | Content/brand guidance and publishing tools |
| `ads` | Paid media strategy, campaigns, creative, audiences, measurement and optimization | Research evidence, optional media/CRM/analytics results |
| `analytics` | GA4 and other channel analysis, CRO, attribution and reporting | Any department supplies events and metrics with provenance |
| `hq` | Task routing, approvals, cross-department missions and overall learning | Calls department modules; never owns their provider clients |

`hq` is the thin host/control plane for combined marketing work. It must not be a required import for an individual department. `writing` appears in DeepSeek session stages but is not an office/module ID; route the work to `content`, `blog` or `social` by capability. Some layout-only agent IDs, such as `budget_monitoring_agent`, have no executable class today. Mark them as visual placeholders until implemented, rather than including them in module capability lists.

There should be one home for each executable skill, agent and provider operation. For example, ads creative belongs to `ads`; the general content department can supply a reusable brand review result. CRM access belongs to `email`/a shared adapter and can be requested by ads for qualified-lead measurement. No copied Google/Meta/GA4 clients across modules.

## Small shared contract

Use a common department shape: `createDepartment(options)`, `listCapabilities()`, `run(task)`, and `close()`. Add `resume(taskId)` for workflows with persisted operations, such as ad launches. A module can expose more specific functions on its own subpath, but the harness needs only this common surface.

Each department receives the business/brand context it needs as an input snapshot, plus explicit credentials/configuration, storage and optional event callback. Task results state whether work completed, needs input/review, failed, or is still running. Include artifact IDs and source references so another department can consume a result without importing its internals.

The host keeps a static, lightweight capability map: task type -> owning department and required capabilities. It dynamically imports the corresponding entrypoint and caches that department instance for the host lifetime. A multi-department mission activates its stages in dependency order. Direct standalone use imports only the relevant subpath, such as `autonomous-marketing-harness/ads` or `/social`.

Do not activate by searching arbitrary prompt substrings such as `includes('ad')`; the existing DeepSeek routing has this problem. Parse or select a structured task capability first, then use the capability map. An ambiguous task can be routed by HQ before any department client starts.

There is no need for a plugin marketplace, separate processes or repositories at this stage. Keep modules in this TypeScript package under `src/departments/<id>/` with package subpath exports when ready. Move existing implementations into that structure gradually; do not duplicate working logic merely to rearrange files.

## Current coupling to remove

| Existing location | Current behavior | Target |
|---|---|---|
| `src/index.ts` | `initializeMarketingHarness()` creates memory, every MCP integration, every skill and every agent | Initialize HQ and the light capability map; no department provider/client startup |
| `src/agents/agent-registry.ts` | Eagerly constructs all 15 implemented agents | Construct only the selected department's real agents |
| `src/skills/index.ts` | Eagerly registers all marketing and LinkedIn skills | Register each module's skills on its activation |
| `src/mcp/mcp-registry.ts` | Eagerly registers Google, Meta, GA4, email, CRM, CMS, research and LinkedIn tools | Register only tools required by an activated module/workflow |
| `src/core/capability-registry/capability-registry.ts` | Global capabilities do not identify an owning department | Add ownership and dependency metadata to the existing registry |
| `src/core/deepseek/deepseek-brain.ts` | Keyword stages and timed simulated completion | Route to selected module, await real result, compose cross-department tasks |
| `src/workflows/daily-loop.ts` | Calls mixed-channel tools directly | Request scoped module jobs; a department runs only when its job is due |
| `src/visualization/office-mapper.ts` | Defines physical offices and visual roles | Render module/task state; do not control executable registration |
| `bin/cli.js` | Initializes the full harness before command dispatch | Dispatch command first, then load HQ or selected department |

The existing `MCPClient`, `SkillEngine`, `AgentRegistry`, `MemoryManager` and event bus are process singletons. Standalone isolation requires either scoped instances or dependency injection at the seams that matter. Start with the smallest change that permits a department to run without the root initializer; replace global singletons only when an actual collision is observed. Shared logging or pure utilities can remain shared.

## Migration order

1. **Prove the boundary with ads:** build its direct entrypoint and lazy host activation, using the ads plan's first milestone. Add a check that a non-ads task imports no ads client or job.
2. **Extract the common loader:** promote the minimal routing and activation code proven by ads into the host. Only then give `research`, `content`, `blog`, `email`, `social` and `analytics` matching entrypoints, one at a time.
3. **Move ownership, not copies:** relocate each department's agents, skill registration and integration setup behind its entrypoint. Keep shared context/results as explicit inputs. Migrate existing mission stages to the new routing.
4. **Make HQ optional:** direct module entrypoints work without `initializeMarketingHarness()`; combined missions still run through HQ. Update the CLI and dashboard to activate modules only as requested.
5. **Replace simulated status:** when a module is not yet executable, expose `unavailable` or `planned` capability status. Do not let the office animation or a mock tool report successful real work.

Acceptance checks for every department: importing the subpath causes no network request or timer; standalone `run()` succeeds with its own required inputs; an unrelated department remains uninitialized; a combined mission gets real outputs from each activated department; `close()` releases local resources without changing external provider state. Ads additionally needs the write/restart checks in its plan.

This is an architecture correction to the earlier ads-only plan. It does not claim the existing departments have already been extracted or that every visual office role is implemented.
