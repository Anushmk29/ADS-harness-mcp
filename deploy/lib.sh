# Shared helpers for deploy/*.sh. Source it; do not run it.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${HARNESS_ROOT:-/srv/harness}"
CLIENTS="$ROOT/clients"

# Value of KEY from a .env file (no export, no eval).
env_get() { grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2-; }

# Set KEY=VALUE in a .env file, replacing an existing line.
env_set() {
  if grep -qE "^$2=" "$1"; then sed -i "s#^$2=.*#$2=$3#" "$1"; else echo "$2=$3" >> "$1"; fi
}

# Wait up to $2 seconds (default 90) for the client on port $1 to answer /api/health.
wait_healthy() {
  local port="$1" limit="${2:-90}" waited=0
  until curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; do
    sleep 3; waited=$((waited + 3))
    [ "$waited" -ge "$limit" ] && return 1
  done
}

clients() { ls -1 "$CLIENTS" 2>/dev/null || true; }
