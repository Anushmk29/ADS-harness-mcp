# Modular Client Marketing Assistant Plan

## Summary

Restructure the current application as a modular monolith with three clear areas:

```text
Client Application
├── Core
│   ├── Authentication and onboarding
│   ├── Business and brand profile
│   ├── Approvals and audit trail
│   ├── Scheduler and notifications
│   └── Combined client reporting
├── Ads Module
│   ├── Google Ads
│   ├── Meta Ads
│   ├── GA4
│   ├── Paid-ad copy and creative briefs
│   └── Analysis, recommendations, and approved actions
└── Content Module
    ├── Organic content strategy
    ├── Blog, email, and social drafts
    ├── Brand and originality checks
    └── Content library and approval workflow
```

Ads and Content will have separate code, routes, storage tables, tests, and interfaces, but remain in one application and deployment. This provides real separation without premature microservice complexity.

## Key Changes

### 1. Establish the module seams first

Create two top-level feature modules:

- `src/modules/ads`
- `src/modules/content`

Keep only genuinely shared capabilities in `src/core`.

Each module exposes one small interface:

```ts
interface MarketingModule {
  listCapabilities(): Capability[];
  run(command: ModuleCommand): Promise<ModuleResult>;
  health(): Promise<ModuleHealth>;
  close(): Promise<void>;
}
```

Dependency rules:

- Ads must not import Content.
- Content must not import Ads.
- Modules may import shared Core types and infrastructure.
- Core may coordinate modules through their interfaces but must not contain campaign or content-generation logic.
- Provider-specific code stays inside its owning module.
- Shared business and brand information is passed into modules through typed requests.

### 2. Ads Module ownership

Move or consolidate the existing Ads department, paid-ads agents, Google/Meta/GA4 clients, measurement logic, policies, and campaign skills into the Ads module.

The module owns:

- Google Ads and Meta Ads account connections.
- GA4 property connection and reporting.
- Campaign, ad set, keyword, search-term, audience, budget, and creative analysis.
- Attribution, funnel, landing-page, and conversion analysis.
- Paid-ad copy, creative variations, and creative briefs.
- Recommendations with evidence, confidence, expected impact, urgency, and risk.
- Approval-controlled campaign changes.
- Ads reporting datasets.

Ads operation lifecycle:

```text
DRAFT → PENDING_APPROVAL → AUTHORIZED → DISPATCHED → VERIFIED
```

Include explicit `REJECTED`, `FAILED`, and `VERIFICATION_FAILED` states. Never retry an uncertain provider write automatically.

All live Google or Meta modifications require human approval in v1. GA4 remains read-only.

### 3. Content Module ownership

Consolidate organic content agents, LinkedIn skills, blog/email/social generation, content evaluation, CMS draft adapters, and content memory into the Content module.

The module owns:

- Content briefs and calendars.
- Blog, email, LinkedIn, and organic social drafts.
- SEO-oriented content generation.
- Brand-voice and banned-phrase validation.
- Originality and similarity checks.
- Content artifact history and versions.
- Draft review and approval.
- Content performance notes entered by the user.

Publishing remains draft-only in v1. The module prepares approved content for manual publishing or export but does not automatically publish to external platforms.

Paid-ad copy belongs exclusively to Ads, even when it uses shared brand information.

### 4. Shared Core ownership

Core contains only capabilities required by both modules:

- Single-client authentication and admin session.
- Client onboarding and business profile.
- Brand rules, products, audiences, objectives, KPIs, currency, and timezone.
- Encrypted provider credential storage.
- Approval inbox and immutable audit events.
- Job scheduler with leases, retries, and dead-letter state.
- Email notification delivery.
- Combined dashboard and client reports.
- CSV outcome imports.
- Module registry and command routing.

Use SQLite as the production state store for the single-client deployment. Keep secrets encrypted and never include credentials in module commands, logs, or approval payloads.

### 5. Data segregation

Use separate tables or repositories by ownership:

- Core: users, business profile, brand profile, approvals, jobs, reports, audit events, encrypted connections.
- Ads: metric snapshots, campaigns, recommendations, tracking health, imported outcomes, provider operations.
- Content: content artifacts, versions, calendars, evaluations, content approvals.

Shared records use stable IDs rather than importing another module’s repository.

The combined report reads module-produced summaries through their interfaces; it does not query module tables directly.

### 6. Public routes and interfaces

Group routes by module:

```text
/api/core/auth/*
/api/core/onboarding/*
/api/core/approvals/*
/api/core/reports/*
/api/core/jobs/health

/api/ads/dashboard
/api/ads/analysis
/api/ads/recommendations
/api/ads/operations/*
/api/ads/connections/:provider/*
/api/ads/imports/outcomes

/api/content/dashboard
/api/content/artifacts/*
/api/content/calendar
/api/content/generate
/api/content/evaluate
/api/content/approvals/*
```

Introduce shared types:

- `BusinessProfile`
- `BrandProfile`
- `KpiTarget`
- `ModuleCommand`
- `ModuleResult`
- `ModuleHealth`
- `ApprovalOperation`
- `ScheduledJob`
- `ReportSection`

Ads-owned types:

- `ProviderConnection`
- `MetricSnapshot`
- `TrackingHealth`
- `OutcomeRecord`
- `AdsRecommendation`
- `AdsOperation`

Content-owned types:

- `ContentBrief`
- `ContentArtifact`
- `ContentVersion`
- `ContentEvaluation`
- `ContentCalendar`

Keep the existing `/api/departments/*` endpoints temporarily as compatibility adapters, then remove them after the dashboard and tests use the module routes.

## Implementation Sequence

1. Fix the existing invalid Meta account configuration so the baseline test suite can execute.
2. Add Core, Ads, and Content module ownership rules and interfaces.
3. Move Ads implementation behind the Ads interface without changing behavior.
4. Move organic content implementation behind the Content interface.
5. Extract direct content handling from the large server into Content routes.
6. Replace generic department routing with explicit module routing.
7. Move shared approvals to Core and connect both module workflows.
8. Introduce SQLite repositories and migrate filesystem state safely.
9. Add encrypted self-service Google Ads, Meta Ads, and GA4 connections.
10. Build daily Ads synchronization, recommendation generation, and approval-controlled execution.
11. Build Content drafting, evaluation, library, and review workflows.
12. Add the combined beginner-friendly dashboard, weekly email report, and monthly review.
13. Add durable scheduled jobs, health checks, backups, and operational alerts.
14. Pilot with one client in dry-run mode, then enable approved live Ads actions.

## Test Plan

- Verify Ads can start and run without loading Content providers or skills.
- Verify Content can start and run without Ads credentials or provider clients.
- Reject cross-module capability calls.
- Confirm paid-ad copy routes to Ads and organic content routes to Content.
- Confirm GA4 is available only through Ads and remains read-only.
- Verify brand-profile changes are visible to both modules.
- Verify Content cannot dispatch external publishing actions.
- Verify every Google or Meta write requires approval.
- Verify rejected and edited approvals cannot dispatch the original payload.
- Verify operation IDs prevent duplicate provider mutations.
- Verify reports combine module summaries without direct cross-module database access.
- Verify expired credentials, provider rate limits, partial data, stale data, and failed jobs are visible to the client.
- Run migration tests against existing content artifacts, Ads journal records, and business configuration.
- Require passing build, unit, route, migration, and dry-run integration tests before the first client rollout.

## Assumptions and Defaults

- One isolated deployment and one admin account per client.
- Ads, Content, and Core remain in one repository and process for v1.
- Ads owns Google Ads, Meta Ads, GA4, and all paid-ad creative.
- Content owns only organic blog, email, SEO, LinkedIn, and social content.
- Content publishing is manual or export-only in v1.
- Every live Ads change requires approval.
- Daily Ads checks, weekly client reports, and monthly reviews are the default cadence.
- GA4 and CSV outcome imports are the initial business-outcome sources; CRM integration is deferred.
- E-commerce, lead generation/local services, and SaaS are supported initially.
- Regulated categories require manual review and are not automated.
- Separate services, separate repositories, a standalone Analytics module, automatic publishing, and automatic budget changes are deferred until usage demonstrates the need.
