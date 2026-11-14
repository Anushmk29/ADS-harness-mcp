# Source map

[Project home](../README.md) · [Documentation](../docs/README.md) · [Tests](../tests/README.md)

Start at [index.ts](index.ts) for library initialization and exports, or
[../bin/](../bin/) for command-line entrypoints. TypeScript builds to the same folder
layout under `dist/`; public package exports are defined in `package.json`.

| Area | Responsibility | Useful starting point |
|---|---|---|
| `modules/ads/` | Guarded ad operations, approvals, planning, measurement and provider tools | [service.ts](modules/ads/service.ts), [tools.ts](modules/ads/tools.ts) |
| `modules/ads/providers/` | Direct Google Ads, Meta and GA4 integrations | [direct-adapter.ts](modules/ads/providers/direct-adapter.ts) |
| `modules/ads/meta-mcp/` | Optional upstream Meta MCP integration | [mapping.ts](modules/ads/meta-mcp/mapping.ts) |
| `modules/creative/` | OpenRouter image generation and exact-size text composition | [openrouter.ts](modules/creative/openrouter.ts), [compose.ts](modules/creative/compose.ts) |
| `modules/decode/` | Competitor and own-ad research, classification and transcription | [index.ts](modules/decode/index.ts) |
| `departments/` | Capability catalog, department runtime, jobs and scheduling | [runtime.ts](departments/runtime.ts), [catalog.ts](departments/catalog.ts) |
| `core/` | Model calls, tool runner, module registry, client state and tracking | [registry.ts](core/modules/registry.ts), [tool-runner.ts](core/deepseek/tool-runner.ts) |
| `memory/` | Persistent business, brand, customer, feedback and learning memory | [memory-manager.ts](memory/memory-manager.ts) |
| `skills/` | Shared executable skills; guidance text lives in `knowledge/` | [knowledge.skill.ts](skills/marketing/knowledge.skill.ts) |
| `mcp/` | MCP client, authentication and shared integrations | [mcp-client.ts](mcp/mcp-client.ts) |
| `server/` | HTTP API and dashboard serving | [server.ts](server/server.ts), [console-routes.ts](server/console-routes.ts) |
| `ops/` | Diagnostics, backup, Google authentication and operating summaries | [doctor.ts](ops/doctor.ts) |
| `workflows/` | Daily loop and missions | [daily-loop.ts](workflows/daily-loop.ts) |
| `visualization/` | Dashboard events and agent office state | [event-bus.ts](visualization/event-bus.ts) |
| `observability/` | Logging, audit trails and alerts | [logger.ts](observability/logger.ts) |
| `config/` | Configuration loading and runtime data paths | [config-loader.ts](config/config-loader.ts), [paths.ts](config/paths.ts) |
| `types/` | Shared TypeScript types | [index.ts](types/index.ts) |

Keep feature code in its existing module and shared code in its existing area. The
dashboard's browser code lives in [public/](../public/), outside this TypeScript build.
