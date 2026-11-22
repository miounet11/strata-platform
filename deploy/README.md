# Deploy stratat.com → VPS

Target: production VPS via `DEPLOY_HOST` (SSH port 22). Store credentials in your password manager or gitignored `.deploy.env` — never commit them.

## Stack

- **www** — Next.js standalone on `:3000` behind nginx (`www.stratat.com`). nginx serves `/_next/static/` from `apps/www/.next/static/` and runtime hero covers `/media/` directly from `apps/www/public/media/`.
- **api** — Fastify on `:8787` (`api.strata.com`)
- **TLS** — certbot on the VPS

## Safe Day-2 Sync & Deploy (Canonical Workflow)

Always deploy from a workstation using `deploy/sync-and-deploy.sh` (never raw `rsync --delete` against `/opt/stratat/`).

```bash
# 1. Preview exact file transfers without touching production
DEPLOY_HOST=<vps-ip> ./deploy/sync-and-deploy.sh --dry-run

# 2. Full code sync + atomic build + patrol ratchet + PM2 swap + live HTTPS smoke test
DEPLOY_HOST=<vps-ip> ./deploy/sync-and-deploy.sh

# 3. Fast sync + <1s zero-rebuild ISR refresh (for scripts/catalog/copy updates)
DEPLOY_HOST=<vps-ip> ./deploy/sync-and-deploy.sh --revalidate all

# 4. Sync scripts & update server crontab in one step
DEPLOY_HOST=<vps-ip> ./deploy/sync-and-deploy.sh --sync-only --with-cron
```

Tip: create a gitignored `.deploy.env` in the repo root (`DEPLOY_HOST=<vps-ip>`) to use the shorthand pnpm scripts: `pnpm deploy:dry`, `pnpm deploy:www`, `pnpm deploy:revalidate`, `pnpm deploy:sync`.

### Ownership Boundary (What Sync Touches vs Protects)

- **Code-owned (synced from git)**: `apps/www/src/` (except `src/data/`), `apps/www/messages/`, `apps/www/scripts/`, `apps/www/tests/`, `apps/www/public/fonts/`, catalog allowlist (`benchmarks.json`, `columns.json`, `friendly-links.json`, `gpus.json`, `models.json`, `topics.json`), `scripts/` (code only), `deploy/`, `docs/`.
- **Server-owned (NEVER deleted or overwritten)**:
  - `.env*`, `.dashboard-secret`, `apps/api/data/`, `apps/api/.env`, `/opt/stratat/var/`, `backups/`, `logs/`
  - `apps/www/.next*`, `apps/www/patrol-baseline.json`, `apps/www/public/media/`
  - `apps/www/src/data/{releases,community,downloads,changelog,vps-deals,media-manifest,intelligence-pulse,creator-pulse}.json`
  - `scripts/content/{out,.quarantine,plan.json,.plan.*.json,.state.jsonl,radar.json,radar-state.json,traffic-board.json}`

## Automated Update Cadence (`deploy/install-content-cron.sh`)

| Schedule (UTC) | Job | Purpose |
|---|---|---|
| `45 6,18 * * *` | `scripts/content/daily-guides.sh` | Twice daily (14:45 & 02:45 CST): Radar + topic mining + LLM writing (up to 10/locale) + SVG/WebP cover + paced publish (**25/run = 50/day**) + `<1s` ISR + IndexNow |
| `20 * * * *` | `scripts/freshness-watch.mjs` | Hourly release/download watcher with `<1s` zero-rebuild ISR (`POST /api/revalidate`) + IndexNow |
| `15 0,4,8,12,16,20 * * *` | `scripts/content-grow.mjs` | Every 4h: sync GitHub community/releases/downloads/pulses + `<1s` ISR (`--scope all`) |
| `5 6 * * *` | `CONTENT_GROW_REBUILD=1 content-grow.mjs` | Daily safety full atomic rebuild + patrol floor verification |
| `20 3 * * *` | `deploy/patrol-daily.sh` | Daily live quality audit & regression alert |
| `0 2,6 * * *` | `deploy/daily-report.sh` | Feishu traffic + publishing report (10:00 & 14:00 CST) |

## First Boot Only (Fresh Server)

`deploy/remote-bootstrap.sh` is strictly for provisioning a brand-new server (`apt`, `pm2 start`, `certbot`). Never run it on a live box with active data.
