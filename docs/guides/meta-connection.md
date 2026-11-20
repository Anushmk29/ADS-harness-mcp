# Connect Meta and review changes once

The dashboard and MCP share `ADS_DIRECT_META_ACCESS_TOKEN` and the durable ads journal. Start with read-only access, verify the intended account, then enable reviewed writes. Tokens are configured on the server; never paste one into a chat or campaign payload.

## 1. Choose the connection

| Connection | App setup | When to use it |
| --- | --- | --- |
| Direct Marketing API (default) | Marketing API use case | Account reads and reviewed campaign/creative creation |
| Official Meta Ads MCP (optional) | Ads MCP server use case, where offered by Meta | Additional MCP diagnostics and tools; enable with `ADS_META_MCP=on` |

Open [Meta for Developers](https://developers.facebook.com/apps/), create or select your business app and connect the correct business portfolio. In Use cases, select the Marketing API case for creating/managing ads (or measuring performance for reporting only). For the official MCP path, add the Ads MCP server case where available. Labels and availability vary with Meta's app setup; a missing permission must be enabled for the app before generating the token.

## 2. Select permissions for the work

| Work | Permissions to configure |
| --- | --- |
| Read ads and insights | `ads_read` |
| Create/manage campaigns and creatives | `ads_management` |
| Official Ads MCP | `ads_mcp_management` in addition to the ads permissions for your work |
| Discover/manage business assets | `business_management` |
| Discover Pages / use Page ad identity | `pages_show_list`, `pages_read_engagement`, `pages_manage_ads` as required by the Page operation |
| Instagram identity | `instagram_basic`; additional branded-content permissions only for those tools |
| Catalog operations | `catalog_management` |
| Read lead submissions | `leads_retrieval` |

Do not request every optional permission for basic campaign reporting. Permission grants and access to the actual ad account, Page, Instagram account or catalog are separate requirements. The token owner must have access to each asset used.

Meta's [Login for Business documentation](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/) lists supported permissions and explains access requirements. Managing other businesses through your app may require Advanced Access and App Review; a permission in the app dashboard is not itself approval or an asset grant.

## 3. Generate and inspect a token

1. For an interactive user token, open [Graph API Explorer](https://developers.facebook.com/tools/explorer/), choose **your app**, choose a user access token and select the permissions above for your work. Sign in with the person who has access to the target assets and grant that access.
2. For unattended direct Graph API jobs, use a system user in Business Settings, assign the relevant app and assets, then generate its token with the required permissions. Follow Meta's [system-user token instructions](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens). Verify token-type support separately before using the official Ads MCP endpoint; do not assume every token usable by Graph works there.
3. Use Meta's [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) to check app ID, validity, expiry and granted permissions. A short-lived Explorer token needs renewal; the harness does not automatically renew Meta tokens.
4. Store the token as `ADS_DIRECT_META_ACCESS_TOKEN` in the server's environment or local git-ignored `.env`. Restart the dashboard and MCP process after replacing it so both use the same credentials.

## 4. Verify without spending

```powershell
npm run build
node --env-file=.env bin/department.js ads run examples/departments/meta-accounts.json
```

Confirm the intended account appears. Put its exact quoted numeric ID in `config/ads-module.yaml` under `accounts.meta`. Leave `mode: dry-run` while preparing drafts. Set `mode: live-with-approval` only for reviewed writes. Existing readiness and deployment-verification gates still apply to campaign launches.

For MCP-only diagnostics, also set `ADS_META_MCP=on`. A working direct Graph read does not establish MCP availability. A permission or account eligibility rejection needs correction at Meta; reconnecting is not a substitute.

## 5. Approve the complete work once

- **New campaign:** use `meta_ads_prepare_launch` to preview, then `ads_launch_meta` with the complete final spec. One journal operation and approval cover the campaign, ad set, image upload, creative copy and ad. Use `spec.ad.creative.imageBytes` for a new base64 image, or exactly one existing `imageHash`, `videoId` or `existingPostId`. Do not submit the children separately. This launch currently supports one ad.
- **New image creative:** use `ads_publish_meta_creative` with `accountId`, a stable `operationId`, `name`, `pageId`, base64 `imageBytes` (no data-URL prefix), `primaryText`, optional `headline`/`description`, `destinationUrl` and `callToAction`. The dashboard approval shows the image and final copy together. One approval uploads the image, creates the creative and reads it back. It does not attach it to an ad or activate delivery. The generic ads department API/MCP exposes this tool.
- Draft/local image and copy reviews do not each need publishing approval. Collect feedback, finalize the whole creative, then submit it once. For a new campaign with a fresh image, send the image bytes in the launch spec instead of publishing the image or creative separately first.
- Reuse the operation ID for the exact same request. Changing media, copy, destination, identity, audience, budget or any other payload field requires a new operation and approval. Approval never grants open-ended account access.
- New campaign objects remain paused. Activation is a separate decision in Ads Manager. An uncertain write must be inspected there before any further write; do not issue a fresh ID to retry it.

## Troubleshooting synchronization

| Symptom | Check/action |
| --- | --- |
| Token/permission rejection | Debug token expiry, app and scopes; verify assigned assets. Restart both processes after updating credentials. |
| MCP timeout/disconnection | The next read retry establishes a new session and reloads the token. Writes are never replayed automatically after a lost response. |
| Long launch shows in progress | Active dispatch leases renew every 20 seconds. After a crash, expiry marks an unresolved write uncertain; inspect the provider account. |
| Creative is PARTIAL | Inspect saved image hash/creative ID before taking any further action. The uploaded image may already exist even if creative creation failed. |
| Different account in dashboard and MCP | Compare deployment, data directory, policy file and account allowlist; both must use the same server configuration. |

## Simpler connection: evaluated next step

Facebook Login for Business supports a **Connect Meta → choose assets and consent** onboarding flow. The harness currently has token-based Meta setup, not this login button. Building that flow requires a configured Meta app/login configuration, registered redirect URI, server-side authorization-code exchange, state/CSRF checks, protected token storage, expiry/revocation handling and an account picker. App Review/Advanced Access requirements depend on whose businesses the integration serves. See [Meta's login requirements and token types](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/).

Reuse the existing auth/token-store infrastructure when implementing it, after the deployment's Meta app and redirect configuration are available. Do not claim a two-click connection until the complete callback and asset-selection flow has been tested against that app.
