# Marketing Harness

Paid-advertising tools for Meta Ads, Google Ads and GA4, with a local MCP server,
dashboard, reviewed ad changes, creative generation and competitor-ad research.

## Start here

| I want to... | Open |
|---|---|
| Install the harness or connect Claude Code | [Setup](SETUP.md) |
| Find a guide, specification or plan | [Documentation index](docs/README.md) |
| Use departments, MCP tools and reviewed writes | [Department quickstart](docs/guides/departments-quickstart.md) |
| Find the code for a feature | [Source map](src/README.md) |
| Run or find tests | [Testing guide](tests/README.md) |
| Deploy for a client | [Deployment guide](deploy/README.md) |
| Find marketing playbooks used by the tools | [Knowledge router](knowledge/README.md) |
| See what changed | [Changelog](CHANGELOG.md) |

## Everyday commands

Use Node.js 24+ and pnpm. Run commands from this folder. Follow [SETUP.md](SETUP.md)
for credentials and first-time configuration; initial setup uses dry-run.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:mcp

# Dashboard, with local environment settings
node --env-file=.env bin/cli.js dashboard

# Show platform modes and credential readiness
node --env-file=.env bin/cli.js ads-status
```

Live provider acceptance must be verified for each account. Local tests and simulated
output do not verify live account access. Ad writes use exact-operation approval.

## Folder map

```text
marketing-harness/
|-- README.md              Start here
|-- SETUP.md               Installation and Claude Code / MCP onboarding
|-- CLAUDE.md              Instructions automatically read by Claude Code
|-- bin/                   CLI and MCP entrypoints; run the built dist/ code
|-- config/                Business settings, platform modes and account policies
|-- src/                   TypeScript application code (see src/README.md)
|-- public/                Dashboard HTML, CSS and JavaScript
|-- tests/                 Tests grouped by application area
|-- docs/                  Human-facing documentation (see docs/README.md)
|   |-- guides/            Operating and feature guides
|   |-- ads/               Ads integration references, requirements and specs
|   |-- architecture/      System design and dashboard specifications
|   |-- plans/             Implementation plans and build briefs
|   |-- campaigns/         Business-specific strategies, budgets and creative briefs
|   `-- history/           Progress reports and the original system overview
|-- knowledge/             Runtime marketing guidance read by skill_knowledge
|-- products/              Product descriptions, ICPs and case studies
|-- examples/              JSON requests for CLI / department tools
|-- deploy/                Client deployment, updates and backup scripts
|-- graphify-out/          Generated code and document knowledge graph
|-- .marketing-data/       Local runtime data and tokens (Git-ignored)
|-- runs/                  Generated creatives, when present (Git-ignored)
`-- dist/                  Compiled output from pnpm build (Git-ignored)
```

Tooling files such as `package.json`, `tsconfig.json`, `vitest.config.ts`, the Dockerfile
and lockfile stay at the root. `node_modules/`, `.pnpm-store/` and `.ua/` are local
dependencies or caches.

The generated graph still contains the previous document and test paths. Run
`/graphify --update` before using it to navigate this layout.

## Where new work belongs

- Feature code goes in `src/modules/ads`, `src/modules/creative` or `src/modules/decode`.
  Shared runtime code stays in the existing shared folders shown in the source map.
- Put tests in the matching area under `tests/`; keep shared isolation in `tests/setup.ts`.
- Put human-facing docs under the appropriate `docs/` folder and link them from its index.
- Put runtime marketing guidance in `knowledge/`; update its router and `SOURCES.md`.
- Keep business source material in `products/` and runnable sample requests in `examples/`.
- Record tool, skill and guidance changes in `CHANGELOG.md`.

Historical documents preserve older designs and removed features. Current source,
configuration and setup instructions take precedence.
