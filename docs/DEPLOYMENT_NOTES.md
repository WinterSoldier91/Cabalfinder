# Cabalfinder Deployment Notes

_Last updated: 2026-04-02_

## Canonical Production URLs

Use these as equivalent production entrypoints:

- `https://cabalfinder-seven.vercel.app`
- `https://cabalfinder-akshayyuk-4584s-projects.vercel.app`
- `https://cabalfinder-git-main-akshayyuk-4584s-projects.vercel.app`

## Current Deployment Model

- Hosting: Vercel (production)
- Web: Next.js app (`apps/web`)
- API: Fastify via Vercel serverless adapters (`api/healthz.ts`, `api/v1.ts`)
- Database: Supabase Postgres (`DATABASE_URL`)
- On-chain provider: Helius (`HELIUS_API_KEY`)

## Required Production Environment Variables

Minimum required for working scans + persistence:

- `DATABASE_URL`
- `HELIUS_API_KEY`

Recommended:

- `REDIS_URL`
- `NEXT_PUBLIC_API_BASE_URL` (if needed for non-default routing)

## Post-Deploy Smoke Tests

Run these after every production deployment:

```bash
BASE="https://cabalfinder-seven.vercel.app"

curl -sS "$BASE/healthz"
curl -sS "$BASE/v1/system/status"

curl -sS -X POST "$BASE/v1/scans/active" \
  -H 'content-type: application/json' \
  -d '{"mint":"2odHeumkiJx46YyNHeZvDjMwsoNhpAgFQuipT96npump","topResults":3}'
```

Expected:
- `/healthz` returns `{ "ok": true, ... }`
- `/v1/system/status` returns provider readiness JSON
- scan endpoint returns `{ "ok": true, "scanRunId": ..., "results": [...] }`

## Known Failure Modes and Fixes

### 1) `invalid api key provided`

Symptom:
- Scan request fails with `{"ok":false,"error":"invalid api key provided"}`

Fix:
- Update `HELIUS_API_KEY` in Vercel production env
- Redeploy production

### 2) `Persistence skipped: getaddrinfo ENOTFOUND <host>.supabase.co`

Symptom:
- Scan runs but persistence warning appears in response
- DB operations fail due to DNS resolution

Cause:
- Bad `DATABASE_URL` host in Vercel env (typo/wrong Supabase host)

Fix:
- Set a valid Supabase Postgres URL (prefer pooler host + correct region/port)
- Redeploy production

### 3) One Vercel URL works, another shows old/broken app

Symptom:
- `seven` alias works, `git-main` alias behaves differently

Cause:
- Alias drift across deployments (manual deploy vs GitHub-driven deploy)

Fix:
- Ensure latest commit is pushed to GitHub `main`
- Confirm Vercel Git deploy completes
- Repoint stale alias if needed:

```bash
vercel alias set <latest-deployment-url> cabalfinder-git-main-akshayyuk-4584s-projects.vercel.app
```

## GitHub/Vercel Sync Checklist

1. `git status` must be clean
2. Push to `origin/main`
3. Verify GitHub main SHA is current
4. Verify latest Vercel deployment meta points to the same Git SHA
5. Run smoke tests above on `seven` and `git-main` aliases

## Security Hygiene

- Do **not** keep personal access tokens in git remotes.
- Use clean remote URLs (`https://github.com/<org>/<repo>.git`) or SSH remotes.
- Rotate leaked/exposed tokens immediately.
