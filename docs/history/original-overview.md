> Historical overview retained from the former root README. For current navigation, see [the project home](../../README.md) and [documentation index](../README.md).

# Hyper-Personalized Autonomous Marketing Operating System

New user or Claude Code setup: read [SETUP.md](../../SETUP.md). It covers installation, local credentials, MCP registration, and read-only verification. [CLAUDE.md](../../CLAUDE.md) directs Claude to that guide.

## Modular runtime — start here

See [department setup and testing](../guides/departments-quickstart.md) for independent department imports, the ads/GA4 tool catalogue, MCP, DeepSeek, approvals and required credentials. Local tests are executable; live provider acceptance is not yet verified. Older sections below describe the original design and include template/simulation behavior, not a guarantee of production automation.

### Built natively for DeepSeek Harness (Single-Business AI Marketing OS)

---

## 1. Overview & Core Philosophy

This repository implements a **single-business, hyper-personalized autonomous marketing operating system** inside the DeepSeek Harness.

It is **NOT** a generic chatbot, a collection of disconnected prompts, or a superficial workflow automation wrapper. It functions as a complete **AI Marketing Operating System** designed for **one specific business** (out-of-the-box configured for *ApexScale AI*, fully customizable via `config/business.yaml`).

### The Continuous Iterative Learning Loop

```text
BUSINESS CONTEXT
      ↓
MARKET UNDERSTANDING
      ↓
MARKETING STRATEGY
      ↓
PLANNING
      ↓
CONTENT / CAMPAIGN CREATION
      ↓
QUALITY CONTROL (ANTI-SLOP & BRAND COMPLIANCE)
      ↓
EXECUTION (MCP TOOL LAYER)
      ↓
DATA COLLECTION & ATTRIBUTION (GA4 + CRM)
      ↓
PERFORMANCE ANALYSIS
      ↓
LEARNING (PATTERN DETECTOR + EXPERIMENTS)
      ↓
MEMORY UPDATE (10 PERSISTENT TIERS)
      ↓
STRATEGY IMPROVEMENT (DYNAMIC STRATEGY EVOLUTION)
      ↓
NEXT ITERATION
```

---

## 2. Architecture & Subsystems

```text
                    ┌──────────────────────────┐
                    │     HUMAN / OWNER        │
                    │ Feedback / Approval      │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │      CONTROL PLANE       │
                    │ Marketing Orchestrator   │
                    │ Task Router               │
                    │ Priority Manager          │
                    │ Loop Controller           │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
      ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
      │ Strategy     │   │ Research     │   │ Execution    │
      │ Agents       │   │ Agents       │   │ Agents       │
      └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                     ┌──────────────────────┐
                     │   SPECIALIST AGENTS  │
                     │                      │
                     │ Business Intel       │
                     │ Customer Intel       │
                     │ Competitor Intel     │
                     │ Strategy             │
                     │ Ad Creative          │
                     │ Meta Ads             │
                     │ Google Ads           │
                     │ GA4 Intelligence     │
                     │ CRO Experimentation  │
                     │ Lead Gen & CRM Sync  │
                     │ Executive Reporting  │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ MCP + SKILLS LAYER   │
                     │ 11 Executable Skills │
                     │ 16 MCP Tools         │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ 10-TIER MEMORY & KG  │
                     │ Knowledge Graph      │
                     │ Business / Customer  │
                     │ Brand                │
                     │ Campaign / Perf      │
                     │ Strategy / Feedback  │
                     │ Experiment / Failure │
                     └──────────┬───────────┘
```

---

## 3. Directory Layout

The harness is ads-only (the organic content module was removed on 2026-10-13). Rule of thumb: **ads code → `src/modules/ads`**, anything shared stays in the shared folders. `tests/core/module-boundaries.test.ts` fails if anything imports the removed content module.

```
marketing-harness/
├── bin/                  # Command-line entrypoints (cli, ask, department, jobs, mcp) — run the built dist/
├── config/               # YAML settings: business.yaml (brand), ads.yaml + ads-module.yaml (ads limits)
├── docs/
│   ├── ads/              # Ads specs, PRDs, API reference, DeepSeek ads workflow & operating notes, campaign drafts
│   ├── architecture/     # Modular plan, department design, architecture audit
│   ├── departments-quickstart.md   # Setup & credentials — read this first
│   └── client-console-ui-spec.md   # Dashboard UI spec
├── examples/             # Sample JSON inputs (ads/ = Meta requests, departments/ = compare)
├── products/             # Business source material (product specs, campaigns, case studies) — not code
├── public/               # Dashboard frontend (HTML/CSS/JS) served by src/server
├── knowledge/            # ALL guidance markdown, no code. README.md = router (task → files → tool, conflict precedence).
│   ├── ads/              #   Meta/Google playbook, audit checklists, PPC math, report template; our-business-fit.md wins conflicts
│   ├── creative/         #   Ad creative/copy pipeline (SKILL.md + sources/): static, carousel and video ads, ad copy
│   ├── ops/              #   Diagnose, review panel, learning loop
│   └── SOURCES.md        #   Where each page came from, which version, licence: the update record
│                         #   Read via skill_knowledge (every department + every MCP server). Add new guidance here, never in src/.
├── src/
│   ├── index.ts          # Library entrypoint (re-exports)
│   ├── modules/
│   │   ├── ads/          # ADS: service, journal, planning, measurement; providers/ (Google/Meta/GA4); meta-mcp/; skills/
│   │   ├── creative/     # Ad image generation (OpenRouter) + exact-size text overlay
│   │   └── decode/       # Competitor / own Meta ads decode (Ad Library via Apify)
│   ├── core/             # Shared brain: DeepSeek tool runner, Laya decision client, core store, module registry
│   ├── departments/      # Shared runtime every module runs on: catalog, jobs, guarded provider calls
│   ├── memory/           # Persistent memory (business, brand, customer, feedback, learnings)
│   ├── mcp/              # Shared MCP client, server registry, OAuth, web-research adapter
│   ├── skills/           # Shared executable skill code: types, market research, knowledge reader, learnings (guidance itself is in knowledge/)
│   ├── workflows/        # Daily loop and missions
│   ├── server/           # HTTP API + dashboard server
│   ├── visualization/    # Agent "office" simulation feeding the dashboard
│   ├── observability/    # Logger + audit trail
│   ├── config/           # Loads config/*.yaml
│   └── types/            # Shared TypeScript types
├── tests/                # ads/, creative/, and shared tests (setup.ts runs each test in a temp dir)
├── .marketing-data/      # Runtime data (override with DATA_DIR): SQLite DBs, sessions, OAuth tokens (git-ignored, never commit)
└── dist/                 # Build output from `pnpm build` (git-ignored)
```

### Updating
- **What changed:** `CHANGELOG.md`, newest first. Add a line for every change to tools, skills or `knowledge/`.
- **New guidance:** add the page under `knowledge/`, add a row for it in `knowledge/README.md` (a test fails if the router names a missing file), and add its origin to `knowledge/SOURCES.md`.
- **Refreshing upstream guidance:** `knowledge/SOURCES.md` pins the version each page was taken from; compare upstream against it. Credits are in `NOTICE.md`.
- **What the harness has learned** is data, not docs: it lives in `skill_learnings` (`.marketing-data/memory-snapshot.json`).

---

## 4. Key Systems & Innovations

### A. Ask-first ad changes
- Every ad write goes through the ads operation journal: exact-payload approval, paused-first creation, no retry on uncertain writes.
- The client approves or declines each change in the console Approvals inbox.
- Review feedback is stored in `FeedbackMemory` and learnings (`skill_learnings`).

### B. Multi-Channel Paid Optimization & Fatigue Detection
- **Google Ads**: Harvests non-converting search queries, pushes account-level negative keywords, and reallocates spend to high-intent queries.
- **Meta Ads**: Monitoring reads frequency and CTR. Fatigue detection is planned to produce a pause *recommendation* that needs approval; nothing is ever auto-paused.

---

## 5. Usage & CLI Commands

```bash
# View current Business Brain, active strategy, memory state, and capabilities
node ./bin/cli.js status

# Run the flagship mission: "Increase qualified leads by 30%"
node ./bin/cli.js run-mission

# Run the autonomous daily monitoring and triage loop
node ./bin/cli.js run-daily

# Run the weekly optimization loop
node ./bin/cli.js run-weekly

# Run monthly executive review and budget rebalancing
node ./bin/cli.js run-monthly

# Generate executive performance & learning report
node ./bin/cli.js generate-report

# Run the complete test suite
pnpm test
```

### Direct Ads Integrations (Google Ads / Meta Ads / GA4)

By default the harness's Google/Meta/GA4 MCP tools are **simulated** (mock data). You can
flip them to **live, self-hosted first-party API calls** (no third-party proxy) per platform:

```bash
node ./bin/cli.js ads-status    # show each platform's mode + credential state
```

Enable a platform in `config/ads.yaml` (`mode: dry-run` first, then `direct`), provide the
credentials in `.env`, rebuild, and **every write goes through the ads operation journal**
(payload-hash-bound approval) so no live budget change / campaign pause happens without human approval.

- [Operations guide: docs/ads/ads-direct-integration.md](../ads/ads-direct-integration.md)
- [Integration spec (context & decision grade): docs/ads/ads-mcp-integration-spec.md](../ads/ads-mcp-integration-spec.md)

---
