# Strata Platform roadmap

## Phase 1 (this repo) — MVP

- [x] Monorepo: www + api + desktop shell
- [x] i18n (7 locales) + SEO sitemap/robots/JSON-LD
- [x] Release sync from GitHub (30 tags)
- [x] User register/login (JWT + SQLite)
- [ ] Deploy to VPS + TLS
- [ ] GitHub `strata-platform/strata-desktop` CI for Win/Mac artifacts

## Phase 2 — Product depth

- [x] Desktop MVP: env scan, one-click Strata install, one-click stratat deploy, settings (`docs/DESKTOP.md`)
- [x] Model download manager stub in desktop (`curl -C -` resume → `~/Strata/models`)
- [x] Account dashboard (`/dashboard`, API `GET /v1/me/*`, models bookmark/track)
- [x] X intake loop — `sync:intelligence`, RSSHub + X API, GPU quote extract (`docs/INTAKE.md`, `/pulse`)
- [x] Changelog feed (`sync:changelog`, `/changelog`) + `content:grow` cron + IndexNow script
- [x] Cluster enrichment pipeline (LAN qwen-image-21 + TTS NodePort) — `docs/ENRICHMENT.md`
- clavue-v1 integration for in-app assistant (cn:glm-5.3-flash)

## Phase 3 — GEO

- Structured FAQ per locale (install, VRAM, legal)
- Localized release summaries (not just English bodies)
- Regional download CDN hints

Upstream engine remains **[Niko1221/Strata](https://github.com/Niko1221/Strata)** — this platform is distribution, docs, and UX.
