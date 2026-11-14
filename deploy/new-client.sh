#!/usr/bin/env bash
# Usage: deploy/new-client.sh <slug> <domain>
# Creates /srv/harness/clients/<slug>, generates secrets, picks a port, adds the Caddy site,
# starts the container and runs doctor. Edit config/business.yaml + .env keys afterwards.
source "$(dirname "$0")/lib.sh"

slug="${1:?usage: new-client.sh <slug> <domain>}"
domain="${2:?usage: new-client.sh <slug> <domain>}"
[[ "$slug" =~ ^[a-z0-9-]+$ ]] || { echo "slug must be lowercase letters, digits, dashes"; exit 1; }
dir="$CLIENTS/$slug"
[ -e "$dir" ] && { echo "$dir already exists"; exit 1; }

# Next free port: highest HOST_PORT in use + 1, starting at 4001.
port=4000
for f in "$CLIENTS"/*/.env; do
  [ -f "$f" ] || continue
  p="$(env_get "$f" HOST_PORT)"; [ -n "$p" ] && [ "$p" -gt "$port" ] && port="$p"
done
port=$((port + 1))

mkdir -p "$dir/config" "$dir/data" "$dir/backups"
cp "$REPO"/config/business.yaml "$dir/config/"
cp "$REPO/deploy/templates/ads-module.yaml" "$dir/config/"   # never inherit another client's ad accounts
sed -i "1i # TODO($slug): replace this whole file with $slug's business before going live." "$dir/config/business.yaml"
cp "$REPO/deploy/compose.client.yml" "$dir/compose.yml"
cp "$REPO/.env.example" "$dir/.env"
chmod 600 "$dir/.env"
env_set "$dir/.env" HARNESS_KEY "$(openssl rand -hex 32)"
env_set "$dir/.env" MARKETING_TOKEN_KEY "$(openssl rand -hex 32)"
env_set "$dir/.env" HOST_PORT "$port"
env_set "$dir/.env" IMAGE "marketing-harness:latest"
env_set "$dir/.env" CLIENT_DOMAIN "$domain"
env_set "$dir/.env" APP_NAME "$slug"

printf '%s {\n  reverse_proxy 127.0.0.1:%s\n}\n' "$domain" "$port" > "$dir/Caddyfile"
if [ -f "$ROOT/Caddyfile" ] && command -v caddy >/dev/null; then
  caddy reload --config "$ROOT/Caddyfile" || echo "WARN: caddy reload failed; check $ROOT/Caddyfile"
fi

(cd "$dir" && docker compose up -d)
if wait_healthy "$port" 90; then echo "healthy on 127.0.0.1:$port → https://$domain"; else echo "WARN: not healthy yet; docker compose -f $dir/compose.yml logs"; fi
(cd "$dir" && docker compose exec -T harness node bin/cli.js doctor) || true

cat <<EOF

Next steps for $slug:
  1. Edit $dir/config/business.yaml (the client's business) and ads-module.yaml.
  2. Fill provider keys in $dir/.env (LLM, Meta/Google, Apify, ALERT_TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID).
  3. cd $dir && docker compose up -d && docker compose exec harness node bin/cli.js doctor
  4. Client login: docker compose exec harness node bin/cli.js create-user <name>   (prints a one-time password)
EOF
