#!/usr/bin/env bash
set -euo pipefail
cd /opt/stratat

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx rsync

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable || npm install -g pnpm@9.15.0
  corepack prepare pnpm@9.15.0 --activate || true
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
cat > apps/api/.env <<EOF
PORT=8787
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=/opt/stratat/data/strata.db
CORS_ORIGIN=https://strata.com
EOF
mkdir -p data

export NEXT_PUBLIC_SITE_URL=https://www.stratat.com
export NEXT_PUBLIC_API_URL=https://api.strata.com
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}"

pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm sync:releases
pnpm sync:community || echo "community sync skipped (rate limit); using existing community.json"
pnpm sync:intelligence || echo "intelligence sync skipped; using existing intelligence-pulse.json"
pnpm build

# Next.js standalone does not bundle static assets; copy them beside server.js (see deploy/Dockerfile.www).
STANDALONE_WWW="/opt/stratat/apps/www/.next/standalone/apps/www"
mkdir -p "$STANDALONE_WWW/.next"
rsync -a --delete /opt/stratat/apps/www/.next/static/ "$STANDALONE_WWW/.next/static/"
rsync -a --delete /opt/stratat/apps/www/public/ "$STANDALONE_WWW/public/"

fuser -k 8787/tcp 2>/dev/null || true
pm2 delete all 2>/dev/null || true
pm2 start /opt/stratat/deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash || true

cp -f deploy/nginx/strata.conf /etc/nginx/sites-available/strata.conf
ln -sf /etc/nginx/sites-available/strata.conf /etc/nginx/sites-enabled/strata.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if command -v certbot >/dev/null 2>&1; then
  certbot --nginx -d strata.com -d www.strata.com -d stratat.com -d www.stratat.com -d api.strata.com --non-interactive --agree-tos -m admin@strata.com --redirect || true
else
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d strata.com -d www.strata.com -d stratat.com -d www.stratat.com -d api.strata.com --non-interactive --agree-tos -m admin@strata.com --redirect || true
fi

echo "Deploy done. www :3000 api :8787"
