# Deploy stratat.com → VPS

Target: your VPS via `DEPLOY_HOST` (SSH port 22). Store credentials in your password manager — never commit them.

## Stack

- **www** — Next.js standalone on `:3000` behind nginx (`strata.com`). nginx serves `/_next/static/` from `apps/www/.next/static`, and the daily rebuild restarts `strata-www` after copying those files into the standalone tree.
- **api** — Fastify on `:8787` (`api.strata.com`)
- **TLS** — certbot after DNS points to the VPS

## First boot (on server)

```bash
apt update && apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
mkdir -p /opt/stratat && cd /opt/stratat
git clone <your-stratat-repo> .
cp apps/api/.env.example apps/api/.env
# edit JWT_SECRET, CORS_ORIGIN=https://strata.com
docker compose up -d --build
```

## nginx (snippet)

```nginx
server {
  server_name strata.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }
}
server {
  server_name api.strata.com;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }
}
```

## Content freshness

Cron daily:

```bash
0 4 * * * cd /opt/stratat && pnpm sync:all && pnpm --filter @stratat/www build && docker compose up -d www
```

## GEO / SEO

- hreflang via Next.js locales (en, zh, ja, de, fr, es, pt)
- `sitemap.xml` + `robots.txt` from www
- JSON-LD `SoftwareApplication` on home
- IndexNow on every `content-grow`. Key file: `apps/www/public/3922defa53070fe821fdf6579fe65a36.txt`
- www env `STRATAT_DATA_DIR=/opt/stratat/apps/www/src/data` so hub pages refresh without waiting for the daily rebuild
