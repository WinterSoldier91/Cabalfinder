# Cabalfinder V2 Deployment

This document implements a Supabase-first production deployment path for the V2 stack.

## Architecture

- Web: `apps/web` (Next.js)
- API: `apps/api` (Fastify)
- Database: Supabase Postgres (`PRODUCTION_DATABASE_URL`)
- Redis: Upstash or Redis Cloud (`REDIS_URL`)

## Production Environment Variables

Set these in your API host:

- `API_HOST=0.0.0.0`
- `API_PORT=4000` (or your platform port)
- `CORS_ALLOWED_ORIGINS=https://<your-web-domain>`
- `DATABASE_URL=<supabase-connection-string>`
- `REDIS_URL=<redis-connection-string>`
- `HELIUS_API_KEY=<helius-api-key>`
- `HELIUS_FALLBACK_API_KEYS=<backup_key_1,backup_key_2>` (optional, comma-separated)
- `HELIUS_HOLDER_PAGE_LIMIT=250`
- `HELIUS_MAX_HOLDER_PAGES=10`
- `HELIUS_WALLET_PAGE_LIMIT=100`
- `HELIUS_MAX_WALLET_PAGES=3`
- `TRACKING_MARKET_CAP_MIN_USD=10000`
- `ACTIVE_SCAN_MARKET_CAP_MIN_USD=5000`
- `TOP_HOLDER_LIMIT=50`
- `ALERT_CONTROL_THRESHOLD=0.2`
- `LOG_LEVEL=info`

Set this in your web host:

- `NEXT_PUBLIC_API_BASE_URL=https://<your-api-domain>`

## GitHub Actions Workflows Added

- `.github/workflows/ci.yml`
  - Runs on PR and push to `main`
  - Executes `npm ci`, `npm run typecheck:v2`, `npm run build:v2`

- `.github/workflows/deploy-production.yml`
  - Runs on push to `main` and manual dispatch
  - Runs build checks
  - Applies migrations: `npm run db:migrate`
  - Triggers API and web deployment hooks
  - Performs post-deploy health checks

## Required GitHub Secrets (Production Environment)

Create a GitHub environment named `production` and add:

- `PRODUCTION_DATABASE_URL`
- `API_DEPLOY_HOOK_URL`
- `WEB_DEPLOY_HOOK_URL`
- `API_HEALTHCHECK_URL` (for `/healthz`)
- `API_STATUS_URL` (for `/v1/system/status`)
- `WEB_BASE_URL` (for root web URL)

## Deployment Flow

1. Merge to `main`.
2. CI validates typecheck and build.
3. Production workflow applies DB migrations.
4. Production workflow triggers API deployment.
5. Production workflow triggers web deployment.
6. Workflow validates API and web URLs.

## Recommended Rollout

1. Configure a staging environment first by duplicating the production workflow with staging secrets.
2. Validate one active scan and one persisted lookup in staging.
3. Promote same configuration to production.

## Operational Checks

After deployment:

1. Open the dashboard and run one scan.
2. Verify persisted scan lookup by `scanRunId`.
3. Verify API status endpoint provider readiness.
4. Confirm CORS allows only your web domains.
