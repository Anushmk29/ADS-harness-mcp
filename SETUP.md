# Set up the ads harness with Claude Code

This guide is for a new owner and for Claude Code performing setup on their machine.
The result is a local MCP connection to the paid-ads tools, initially in dry-run.
Meta is the smallest starting point; Google Ads and GA4 are optional.
Organic content is outside this project. No cloud deployment is required for MCP.

## Give this task to Claude

Clone the GitHub repository, open a terminal in the cloned folder, and start `claude`.
The root `CLAUDE.md` points here. Paste:

> Read SETUP.md and set up this harness for me. Check prerequisites, install dependencies,
> build and test it, preserve existing secrets, personalize configuration using facts I
> provide, and register the local MCP servers. Start with Meta in dry-run. Complete all
> local steps you can, then tell me which credentials or sign-ins I must provide locally.
> Verify tool discovery and authorized read-only access. Do not create, activate, delete,
> or change anything on an advertising platform during setup. Report each check as passed,
> failed, or waiting for my input.

Claude can run local installation, edit configuration, register MCP, and test discovery.
The owner supplies their business facts, platform IDs, authorized credentials, and browser
sign-ins. Credentials cannot be generated from this repository. Keep tokens out of chat,
screenshots, shell arguments, and Git; enter them in the local `.env` file or secret store.

## 1. Check the machine and project folder

Use Git, Node.js **24+** (the app uses built-in SQLite), pnpm, and an installed,
signed-in Claude Code. Node 24 and pnpm 11 were used to check this guide locally.
Check in the terminal:

```text
git --version
node --version
pnpm --version
claude --version
```

If needed, install Node 24 from [Node.js](https://nodejs.org/en/download), then install
pnpm with `npm install --global pnpm@11`. Follow the official
[Claude Code installation guide](https://code.claude.com/docs/en/setup) for Claude.
Reopen the terminal after installation. Claude should detect the OS and use its shell's
syntax; it should not change system security settings to work around installation errors.

Run all following commands from the folder containing `package.json` and `bin/mcp.js`.
For a clone, `git rev-parse --show-toplevel` should identify that same folder.

## 2. Install, build, and check local functionality

```text
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:mcp
```

`dist/` is generated and ignored by Git, so every new clone needs the build.
The MCP smoke test checks discovery, a local calculation, and rejection of an out-of-scope
tool without platform credentials. It does not verify a real ad account.
Resolve failures or report them accurately; preserve the lockfile during normal setup.

## 3. Create local configuration

Copy `.env.example` to `.env` **only if `.env` does not already exist**. Preserve existing
values on repeat setup. Environment files are loaded by the explicit Node commands below,
not automatically by `pnpm start` or `pnpm mcp`.

For a fresh install, edit `config/ads-module.yaml` to start with:

```yaml
mode: dry-run
accounts:
  meta: []
  google: []
  ga4: []
verifiedAccounts:
  meta: []
  google: []
  ga4: []
allowedObjects: []
maxBudgetPerWrite: {}
```

The repository may contain the original owner's account ID: replace it with the new
owner's IDs, quoted as strings, only after access is confirmed. Keep `verifiedAccounts`
empty until actual deployment verification. A successful account read is not that verification.
Dry-run still makes live reads when requested; provider-changing writes are not dispatched.

Update `config/business.yaml` with the owner's business, products, audience, geography,
currency, goals, and brand instructions. Preserve the schema and use verified claims.
Existing names, prices, results, product files, and campaign examples belong to the original
business; do not present them as the new owner's facts. Until personalization is complete,
limit usage to explicitly scoped account inspection.

In `.env`, use these local defaults:

```dotenv
HOST=127.0.0.1
SCHEDULER=off
ADS_META_MCP=off
```

Leave `DATA_DIR` blank for this clone's own `.marketing-data` storage, or set a separate
absolute path. Use a separate clone/data directory for each business. Keep `MARKETING_MODE`
unset for real account reads; its `simulation` value is for simulated operation.

Claude Code supplies the model. `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY` are unnecessary
for the basic MCP tools. Optional built-in chat, creative generation, and Decode features
have their own dependencies and are not part of this initial setup.

## 4. Connect the owner's platforms

Configure only the platforms the owner wants. IDs are not substitutes for permissions.

| Platform | Local `.env` values | Owner must provide |
|---|---|---|
| Meta | `ADS_DIRECT_META_ACCESS_TOKEN` | Authorized access to their ad account; Page/Instagram, pixel/dataset, media and other asset access as needed for the intended actions. |
| Google Ads | `ADS_DIRECT_GOOGLE_DEVELOPER_TOKEN`, plus `ADS_DIRECT_GOOGLE_ACCESS_TOKEN` **or** refresh credentials below; optional `ADS_DIRECT_GOOGLE_LOGIN_CUSTOMER` for a manager account | API access and the target customer ID without hyphens. |
| GA4 | `ADS_DIRECT_GA4_ACCESS_TOKEN` **or** refresh credentials below; optional default `ADS_DIRECT_GA4_PROPERTY_ID` | Property ID and reporting permissions; Admin mutations require additional edit permissions/scopes. |

For Google refresh authentication, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`ADS_DIRECT_GOOGLE_REFRESH_TOKEN` and/or `ADS_DIRECT_GA4_REFRESH_TOKEN`.
`GOOGLE_REFRESH_TOKEN` is the shared fallback. Access tokens take precedence, so clear stale
access-token values when switching to refresh credentials. The existing Google sign-in
helper is described in [bin/cli.js](bin/cli.js) under `google-auth`; it prints a refresh
token, so the owner should run it privately and save its output directly in local secrets.
Token issuance, renewal, app permissions, billing, and provider approval remain owner tasks.

Leave API-version overrides at the repository defaults unless provider testing requires a
change. The optional Meta MCP proxy is a separate upstream connection: enable
`ADS_META_MCP=on` only when its permissions and access are available.

## 5. Register the MCP servers in Claude Code

From the repository root, register the full ads department:

```text
claude mcp add --transport stdio --scope local marketing-ads -- node --env-file=.env bin/mcp.js ads
```

For GA4, also register:

```text
claude mcp add --transport stdio --scope local marketing-analytics -- node --env-file=.env bin/mcp.js analytics
```

Use `claude mcp get marketing-ads` before adding an existing entry; preserve unrelated
servers. Local scope keeps these registrations on the owner's machine. No tokens belong
in the registration. Always launch Claude in this repository: these commands use relative
paths, and the harness loads configuration relative to its working directory.

For a smaller Meta-only catalogue, use `ads meta` instead of `ads` in the first command.
That scope omits Google tools and the cross-platform `department_run` entry point.
There is no need to run `pnpm mcp` in another terminal: Claude starts the stdio process.
Running it directly can appear idle because it is waiting for protocol messages.

Check registrations with `claude mcp list`. Restart the Claude session after adding them,
then run `/mcp` to check connection status and complete any host trust/permission prompts.
Reconnect after changing credentials or policy so the server loads the updated configuration.
Command and scope reference: [official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

## 6. Verify real reads and finish setup

Ask Claude:

> Discover the marketing-ads MCP tools. Call meta_ads_list_accounts and show the accounts
> I can access. Do not make any changes. Then, for the account I select, fetch the last
> seven complete days of campaign insights using meta_ads_insights. Report the account,
> date range, currency, and any API errors. Do not substitute simulated results.

The account-list call can also be checked directly:

```text
node --env-file=.env bin/department.js ads run examples/departments/meta-accounts.json
```

After confirming the correct account, put its quoted ID in `accounts.meta`. For Google,
use `google_ads_list_accounts`, then `google_ads_search` against the chosen customer.
For GA4, use `ga4_metadata` and a small `ga4_runReport` with the chosen property ID.
Populate only the owner's confirmed IDs in the corresponding account lists.

Prefer these native tools during acceptance testing. `config/ads.yaml` controls older
skill adapters and defaults to off; legacy composite skills may need separate adapter
configuration. Do not enable simulation or change that legacy file to make a failed
native connection appear successful. Some older docs describe removed departments.

Setup is complete when dependencies/build/checks pass, the chosen MCP servers connect,
business configuration is personalized, and each requested platform returns a real read.
Missing credentials mean **local setup complete, platform connection pending**.
Claude's handoff should list checks/results, connected platforms, remaining owner actions,
configuration files changed (without secrets), and confirmation that mode remains dry-run.

## Optional: dashboard and scheduled work

Native dashboard startup binds to localhost by default. First-admin onboarding requires
local access without an operator key configured, or the configured operator key. Production
still uses operator-created logins. Login throttling uses the socket address; users behind
a reverse proxy share that limit because forwarded headers are not trusted.

Keep `HOST=127.0.0.1` and `SCHEDULER=off` for the first local dashboard session:

```text
node --env-file=.env bin/cli.js dashboard
```

Open `http://localhost:3333`. MCP works without the dashboard. For background monitoring,
set the business timezone in `TZ`, deliberately enable `SCHEDULER=on`, and keep the dashboard
process running. MCP registration alone does not keep scheduled jobs running.
Remote hosting needs the separate [deployment guide](deploy/README.md).

The general `doctor` command also checks the built-in LLM and deployment alerts. Missing
LLM/Telegram configuration is not proof the Claude Code MCP connection is broken.

## Later: enable reviewed live changes

Initial setup ends in dry-run. When the owner explicitly wants live operation, follow
[the paused-write procedure](docs/guides/departments-quickstart.md#4-first-reviewed-paused-write).
Review the account allowlists, budget policy, actual assets, and exact proposed payload.
Budget limits are per-write checks, not a total platform spend cap. Use fresh operation IDs
for different changes; resume the same operation rather than blindly retrying a write.

An operator approves the specific operation through the dashboard or
`bin/department.js <department> approve <operationId>`, then resumes it. Approval alone
does not dispatch it. Claude must not self-approve or weaken the gates to finish a task.
Meta launch creates paused objects; activation requires a separate reviewed change.
Treat `PARTIAL` and `UNCERTAIN` results as reconciliation work, not successful completion.
Google creation has additional validation and rollout gates; do not bypass them.

For a `PARTIAL` Meta launch, use the latest partial operation ID as `launchId` when calling
`ads_continue_meta_launch`. If that continuation also stops partway through, its ID is the
next recovery source. An existing active continuation blocks a second branch from the same
source. `UNCERTAIN` operations still require manual reconciliation.

## Existing data and reports after upgrading

Learnings are stored in `DATA_DIR/learnings.sqlite`. Older JSON learning records are imported
automatically; newer database records take precedence. Back up the entire data directory,
including SQLite files, rather than treating `memory-snapshot.json` as the only copy.

Daily snapshots confirm account currencies before saving monetary totals. The tracking
database records its currency and rejects later imports in another currency. Mixed-currency
accounts need separate reporting or explicit normalization before import. Existing historical
totals have no currency evidence; re-fetch affected periods if earlier imports mixed currencies.

Composite performance reports expose `currency`, `totalMarketingSpend`, `googleConversions`,
and `metaLeads`. Update consumers of the old USD-named fields. Combined conversion totals and
cost per conversion are null because Google conversions and Meta leads have different meanings;
channel results remain available separately. Budget schedules accept checked absolute amounts;
multiplier schedules are refused until their effective amount can be checked.

## Before the original owner pushes to GitHub

Share source, the lockfile, `.env.example`, and these instructions. Do not include `.env`,
`.marketing-data/`, OAuth/client-secret downloads, personal `.claude` settings, account
exports, generated creatives, or backups. Review business-specific files and account IDs
before deciding what your friend should receive. `.gitignore` does not untrack files that
were previously committed; exposed credentials must be revoked, not merely deleted.

Run `git rev-parse --show-toplevel` before staging. It must be this project, not a drive
root or a directory containing other projects. If it resolves elsewhere, publish a clean
copy of this project in its own repository; do not stage the parent tree.
Review `git status --short -- .` and `git diff --cached --name-only` before committing.
Publishing is a separate action from setup and is not performed by following this guide.

## Troubleshooting

| Symptom | Check |
|---|---|
| Missing `dist` module | Run `pnpm run build` in the clone. |
| SQLite import failure | Check the Node executable used by the MCP process is Node 24+. |
| `.env` or policy not found | Start Claude from the repository root and reconnect the server. |
| `node`/`pnpm`/`claude` not found | Fix PATH and reopen the terminal; verify the versions again. |
| Token or permission error | Fix the owner's token/scopes/account access; reconnect and repeat the read. |
| `DRY_RUN` / `PENDING_APPROVAL` | Expected write-control states; setup does not enable live changes. |
| Tool is missing | Check ads versus analytics, platform scope, optional proxy flag, and discovery. |
| Reports stop after closing Claude | Keep the dashboard/scheduler process running for scheduled jobs. |
