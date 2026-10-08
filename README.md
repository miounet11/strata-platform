# Strata Platform

Monorepo for the **Strata Platform** — the multilingual (EN / ZH / JA / DE / FR / ES / PT) marketing, download and community hub for [Strata](https://github.com/Niko1221/Strata), the open-source engine that runs a 125B-class MoE model (Qwen3.8-Flash-Next) locally on your gaming PC.

> **Upstream engine**: [Niko1221/Strata](https://github.com/Niko1221/Strata) (MIT) — this repository contains the *website platform* (site, API, desktop launcher), not the inference engine itself.

| App | Role |
| --- | --- |
| `apps/www` | Next.js 15 site — SEO + i18n (7 locales), releases, models, benchmarks, community, changelog, creator updates |
| `apps/api` | Fastify API — auth (JWT + SQLite), model catalog, download analytics |
| `apps/desktop` | **Strata 控制台** (Tauri v2) — environment detection, one-click Strata install / deploy / settings (`docs/DESKTOP.md`) |

## Quick start

```bash
pnpm install
pnpm dev:www    # http://localhost:3000
pnpm dev:api    # http://localhost:8787
```

```bash
pnpm build      # build all apps
```

## Content pipeline

Data lives in `apps/www/src/data/*.json` and is refreshed by sync scripts (run locally or on a server cron):

```bash
pnpm sync:all        # releases, community, creator, intelligence, downloads, changelog
pnpm content:grow    # all syncs + IndexNow ping
```

- **Releases / changelog** — pulled from the upstream GitHub repo
- **Community** — issues & PRs synced from GitHub
- **Intelligence pulse** — pluggable X/RSS intake (`docs/INTAKE.md`, `docs/INTAKE-CHEAP.md`, `docs/INTAKE-GATEWAY.md`)
- **Media enrichment** — optional LAN AI cluster for images/TTS (`docs/ENRICHMENT.md`); all endpoints configured via env vars, no addresses committed

## SEO / GEO

- hreflang via next-intl locales (en, zh, ja, de, fr, es, pt)
- `sitemap.xml` + `robots.txt` + JSON-LD `SoftwareApplication`
- IndexNow ping on every content refresh (key file: `apps/www/public/<INDEXNOW_KEY>.txt`)

## Deploy

See `deploy/README.md` (Docker / nginx / pm2). Set `DEPLOY_HOST` and credentials via environment — **never commit server addresses, passwords or API keys**. Start from `.env.example`.

## License

MIT — the Strata engine remains under its upstream license ([Niko1221/Strata](https://github.com/Niko1221/Strata)).
