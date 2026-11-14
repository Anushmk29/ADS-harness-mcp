# Deploy kit: one client = one folder

```
/srv/harness/
  repo/                     ← this git checkout (scripts live in repo/deploy)
  Caddyfile                 ← contains:  import clients/*/Caddyfile
  clients/<slug>/
    .env                    ← that client's keys only (chmod 600)
    compose.yml             ← copy of deploy/compose.client.yml
    config/                 ← business.yaml, ads-module.yaml
    data/                   ← DATA_DIR (all sqlite/json state)
    backups/                ← daily-*.tgz / weekly-*.tgz
    Caddyfile               ← <domain> → 127.0.0.1:<port>, auto-HTTPS
```

## One-time VPS setup
1. Install Docker (with the compose plugin), Caddy and curl. `rclone` is optional, for off-box backups.
2. `git clone <repo> /srv/harness/repo && docker build -t marketing-harness:latest /srv/harness/repo`
3. `printf 'import clients/*/Caddyfile\n' > /srv/harness/Caddyfile`, then point Caddy at it (`caddy run --config /srv/harness/Caddyfile`, or the systemd unit).
4. Add the cron jobs:
   ```
   15 2 * * *  /srv/harness/repo/deploy/backup.sh >> /srv/harness/backup.log 2>&1
   ```

## Day-to-day
| Task | Command |
|---|---|
| New client | `deploy/new-client.sh acme acme.yourdomain.com` |
| Client login (one-time password) | `cd clients/acme && docker compose exec harness node bin/cli.js create-user owner` (`reset-password owner` to reissue) |
| Check a client | `cd clients/acme && docker compose exec harness node bin/cli.js doctor` |
| Ship a new version | `git pull && deploy/update-all.sh` (health-gated, auto-rollback per client) |
| All clients at a glance | `deploy/fleet-status.sh` |
| Restore | stop the client, untar a `backups/*.tgz` into `data/`, start it |

DNS: point each client domain (an A record) at the VPS before running `new-client.sh`, so Caddy can get its certificate.

## Railway (alternative)
Use the same Dockerfile. Add a volume mounted at `/app/.marketing-data`. The healthcheck is `/api/health` (already set in `railway.json`). Set the same env vars as `.env`.
