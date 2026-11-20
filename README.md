# Marketing Harness

Paid-advertising tools for Meta Ads, Google Ads and GA4, with a local MCP server,
dashboard, reviewed ad changes, creative generation and competitor-ad research.

## What it does for you, and how far it goes

The harness runs the weekly ad-account routine on its own. Code makes every number and
decision, and it never changes a live ad without your approval. A language model (DeepSeek
or OpenRouter, set in `.env`) is optional and only rewrites the wording of reports. Claude
is not needed for the weekly routine. It is useful for one-off questions and new campaign
strategy.

| What it does | How it helps | Where it stops |
|---|---|---|
| **Daily KPI snapshot** for Meta, Google Ads and GA4 | Records spend and results each day. Results are leads or purchases plus revenue, depending on the `goal` set for each client in `config/ads-module.yaml`. | Only as accurate as the platform's tracking. If the pixel or conversions are wrong, the numbers are wrong. |
| **Weekly findings** with 15 fixed rules (`ads_findings`, `job ads-review`) | Flags ad sets and ads that spend with no results (the 3x rule), cost above target or rising, falling ROAS, CPM spikes, learning-limited ad sets, saturated audiences, underspend, budget concentrated in a few places, creative fatigue, weak CTR and broken tracking. When there isn't enough data, it says "wait" instead of guessing. | **Meta only** for now; Google Ads has KPIs but no rules yet. Rules use set thresholds, not predictions. Without `targets.cpa`, it compares against the account's own average. |
| **Ranked next steps** | Turns findings into up to 5 actions per week: pause, change budget by ±20%, or a manual step. They are ranked by spend at stake, confidence and risk. Pauses and budget changes become approval requests. If tracking looks broken, it suggests only fixing tracking. | It never applies a change itself. Every write needs your approval and must stay under the per-change budget limit, and anything new starts PAUSED. It does not build new campaigns, audiences or creatives. |
| **Client report**, weekly and monthly (`job report weekly`) | Shows results vs the previous period and vs target, top findings, next steps, spend by campaign and work done. A branded page at `/api/console/reports/<id>/html` can be saved as PDF. | Written from fixed templates unless a model is set up. If the model's wording contains any number not in the data, the template is used instead. Reports go to the operator (dashboard or Telegram), not by email to the client. |
| **Competitor ads** (`skill_competitor_ads`, `job competitor-watch`) | Pulls real ads from the Meta Ad Library through Apify. Code finds the longest-running ads, formats, CTAs, offers and landing domains. Each week it shows which competitor ads are new. A model may group ads into angles, and every angle must name real ad IDs. | Needs a paid Apify key (`COMPETITOR_API_KEY`). It shows what competitors run, not how much they spend or how well their ads do. Without a key it shows an error, never sample data. |
| **Creative fatigue watch** (`job ads-fatigue`) | Flags ads whose frequency is rising while CTR falls, and proposes pausing them. | Overlaps with the fatigue rule in the weekly findings. |
| **Ad changes with approval** (MCP tools, dashboard) | Claude or the dashboard can propose edits. Each one is stored with its exact payload, and only that exact payload can be approved and applied. | Dry-run until you turn on live mode for each platform and account. |
| **Agent activity** (dashboard → Agent activity, `job agent-report`) | Records every call Claude, Codex or another MCP client makes, plus every scheduled harness job, with its input, output, errors and time taken. You mark outputs useful or wrong, and a weekly agent report lists failures, wrong outputs and what to fix. | Records calls only. It doesn't see what an agent does outside this MCP server. The "what to fix" pointers come from simple thresholds, and fixing is still your job. |
| **Health check** (`job doctor`, `bin/cli.js doctor`) | Checks credentials, token expiry, targets, whether the pixel fired in the last 48 hours, the Apify key, and model fallback and budget. | It reports problems. It does not fix them. |

**You still need to:** grant the Meta token `ads_read` and `ads_management` permissions,
set `goal` and `targets` for each client, approve or decline proposed changes, decide
creative and campaign strategy, and check results before sending a report to a client.

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

# Run a scheduled job now: ads-review (findings + approvals), report weekly|monthly,
# competitor-watch, kpi-snapshot, ads-fatigue, agent-report, doctor, backup
node --env-file=.env bin/cli.js job ads-review
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
