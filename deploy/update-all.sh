#!/usr/bin/env bash
# Usage: deploy/update-all.sh
# Builds the image from this checkout (tag = git sha), then restarts clients one at a time.
# A client that is not healthy within 90s is rolled back to its previous image.
source "$(dirname "$0")/lib.sh"

tag="marketing-harness:$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
docker build -t "$tag" "$REPO"
docker tag "$tag" marketing-harness:latest

failed=0
for slug in $(clients); do
  dir="$CLIENTS/$slug"; env="$dir/.env"
  [ -f "$env" ] || continue
  prev="$(env_get "$env" IMAGE)"; port="$(env_get "$env" HOST_PORT)"
  env_set "$env" IMAGE "$tag"
  (cd "$dir" && docker compose up -d)
  if wait_healthy "$port" 90; then
    echo "OK   $slug → $tag"
  else
    echo "FAIL $slug on $tag; rolling back to $prev"
    env_set "$env" IMAGE "$prev"
    (cd "$dir" && docker compose up -d)
    failed=1
  fi
done
exit "$failed"
