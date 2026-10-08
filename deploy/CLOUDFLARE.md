# Cloudflare + Strata origin

`stratat.com` / `strata.com` are often **proxied** (orange cloud). Point DNS **A** records to your VPS address (`DEPLOY_HOST`; see `deploy/README.md`).

## SSL

1. Cloudflare dashboard → SSL/TLS → **Full (strict)**  
2. Origin Server → create **Origin Certificate** for `strata.com`, `*.strata.com`, `stratat.com`, `*.stratat.com`  
3. On VPS:

```bash
mkdir -p /etc/nginx/ssl
# paste cert → /etc/nginx/ssl/strata.crt, key → strata.key
```

4. Extend nginx with `listen 443 ssl` using those paths (see `jevcode.conf` on the same host).

## API

- `api.strata.com` → A → your VPS address (can be DNS-only grey cloud for simpler certbot).

## Redeploy

```bash
SSHPASS=... ./deploy/sync-and-deploy.sh
```

Or on server: `cd /opt/stratat && pnpm sync:releases && NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @stratat/www build && pm2 restart ecosystem.config.cjs`

Set `GITHUB_TOKEN` in `/opt/stratat/.env` for daily community sync without rate limits.
