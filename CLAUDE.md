# Marketing harness

This project is a paid-advertising toolkit for Meta Ads, Google Ads, and GA4.
Claude Code supplies the agent; `bin/mcp.js` exposes the harness over local MCP stdio.

For installation, onboarding a new user, or connecting MCP, read [SETUP.md](SETUP.md)
and execute its setup sequence. Continue with independent local steps when credentials
are missing; report the remaining account-access steps precisely.

During normal use:
- Discover the connected server's tools and capability IDs before calling them.
- Use native platform tools for real account work. Legacy template/simulation output
  is not evidence of live performance.
- Keep credentials in the local environment and account data in the local data directory.
- Setup ends in dry-run. Live changes require separate operator authorization and
  the harness's exact-operation approval flow; do not self-approve through the shell.
- Treat current source and configuration as authoritative. Older documents mention
  removed organic-content departments and unverified features.
