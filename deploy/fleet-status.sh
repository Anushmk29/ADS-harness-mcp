#!/usr/bin/env bash
# Usage: deploy/fleet-status.sh
# One row per client: health + the operator summary line (dead jobs, doctor reds, approvals >48h, last login, cost, leads).
source "$(dirname "$0")/lib.sh"

printf '%-18s %-8s %-10s %s\n' CLIENT HEALTH VERSION SUMMARY
for slug in $(clients); do
  env="$CLIENTS/$slug/.env"; port="$(env_get "$env" HOST_PORT)"; key="$(env_get "$env" HARNESS_KEY)"
  health="$(curl -fsS -m 5 "http://127.0.0.1:$port/api/health" 2>/dev/null || true)"
  if [ -z "$health" ]; then printf '%-18s %-8s\n' "$slug" DOWN; continue; fi
  version="$(echo "$health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
  summary="$(curl -fsS -m 10 -H "x-harness-key: $key" "http://127.0.0.1:$port/api/ops/summary?format=line" 2>/dev/null || echo '-')"
  printf '%-18s %-8s %-10s %s\n' "$slug" up "$version" "$summary"
done
