#!/usr/bin/env bash
# Usage: deploy/backup.sh   (cron: 15 2 * * * /srv/harness/repo/deploy/backup.sh >> /srv/harness/backup.log 2>&1)
# Per client: consistent snapshot inside the container → tarball in clients/<slug>/backups.
# Keeps 14 daily + 8 weekly (Sunday). Set RCLONE_REMOTE (e.g. gdrive:harness-backups) to copy off-box.
source "$(dirname "$0")/lib.sh"

day="$(date +%Y%m%d)"; failed=0
for slug in $(clients); do
  dir="$CLIENTS/$slug"; snap="backups/tmp-$day"
  if ! (cd "$dir" && docker compose exec -T harness node bin/cli.js backup "/app/.marketing-data/$snap" >/dev/null); then
    echo "FAIL $slug backup"; failed=1; continue
  fi
  tar -czf "$dir/backups/daily-$day.tgz" -C "$dir/data/$snap" . && rm -rf "$dir/data/$snap"
  [ "$(date +%u)" = 7 ] && cp "$dir/backups/daily-$day.tgz" "$dir/backups/weekly-$day.tgz"
  ls -1t "$dir"/backups/daily-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
  ls -1t "$dir"/backups/weekly-*.tgz 2>/dev/null | tail -n +9 | xargs -r rm -f
  if [ -n "${RCLONE_REMOTE:-}" ]; then rclone copy "$dir/backups" "$RCLONE_REMOTE/$slug" || { echo "FAIL $slug rclone"; failed=1; }; fi
  echo "OK   $slug daily-$day.tgz"
done
exit "$failed"
