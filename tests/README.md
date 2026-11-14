# Tests

[Project home](../README.md) · [Source map](../src/README.md)

Run from the repository root:

```sh
pnpm test                          # All Vitest tests
pnpm exec vitest run tests/ads     # One area
pnpm exec vitest run tests/server/console.test.ts
pnpm build                        # Compile TypeScript
pnpm test:mcp                     # MCP stdio smoke test; requires the build
```

| Folder | Coverage |
|---|---|
| `ads/` | Direct adapters, planning, approvals, Meta MCP and transport retries |
| `creative/` | Prompts, OpenRouter and creative composition |
| `decode/` | Ad normalization, research and transcription formatting |
| `core/` | Authentication, model calls, decisions, module boundaries and tracking |
| `config/` | Production configuration validation |
| `departments/` | Department capabilities, jobs and scheduling |
| `memory/` | Persistent memory |
| `skills/` | Knowledge routing and learnings |
| `ops/` | Diagnostics, backups, Google authentication and summaries |
| `server/` | HTTP APIs, console, frontend and server foundations |
| `workflows/` | Missions and cross-system workflows |
| `mcp/` | Standalone MCP protocol smoke test |

[setup.ts](setup.ts) isolates each Vitest test file in a temporary working directory
and copies `config/` and `public/` there. Keep it at this shared location. Tests must
use temporary data and injected provider responses; the local suite does not verify
live provider access.
