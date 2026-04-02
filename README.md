# Cabalfinder — Solana Holder Intelligence Platform

> **Helius-native, on-chain cabal detection for Solana.**  
> Scans top-50 holder groups across tokens, scores cross-token control clusters, persists results to Supabase, and surfaces copy-ready contract addresses via a Next.js dashboard.

[![Repo](https://img.shields.io/badge/GitHub-WinterSoldier91%2FCabalfinder-blue?logo=github)](https://github.com/WinterSoldier91/Cabalfinder)
[![Stack](https://img.shields.io/badge/stack-TypeScript%20%7C%20Next.js%20%7C%20Fastify%20%7C%20Drizzle%20%7C%20Supabase-informational)](#tech-stack)

---

## What It Does

Cabalfinder answers one question: _which wallets secretly control multiple tokens?_

1. **Index top holders** — For any Solana mint, Helius `getTokenAccounts` builds the authoritative holder group (up to 50 wallets).
2. **Expand wallet positions** — Each holder wallet is enriched via Helius Wallet API; every fungible balance with USD context is pulled.
3. **Score control clusters** — Candidate tokens are filtered above a market-cap floor, then ranked by supply-control %, aggregate USD held, and overlap wallet count into a single weighted score.
4. **Persist and retrieve** — Scan runs, holder snapshots, and ranked results are written to PostgreSQL (Supabase). Any scan can be reloaded by its `scanRunId`.
5. **Alert** — When the control metric for a tracked token crosses a threshold, a Telegram alert is delivered.

---

## Architecture — V2 Monorepo

```
Cabalfinder/
├── apps/
│   ├── api/          # Fastify REST API  (port 4000)
│   │   ├── src/
│   │   │   ├── db/          # Drizzle client + schema (Supabase/Postgres)
│   │   │   ├── clients/     # Helius DAS / Wallet API / RPC clients
│   │   │   ├── services/    # activeScanService — core intelligence engine
│   │   │   ├── repositories/# DB read/write (activeScanRepository)
│   │   │   ├── routes/      # /healthz, /v1/system/status, /v1/scans/active
│   │   │   ├── lib/         # Shared error primitives
│   │   │   ├── env.ts       # Zod-validated env schema
│   │   │   └── server.ts    # Fastify server factory
│   │   ├── drizzle/         # SQL migrations
│   │   └── drizzle.config.ts
│   ├── web/          # Next.js 14 dashboard (App Router, port 3000)
│   │   └── app/
│   │       ├── page.tsx     # Helius Signal Desk — scan UI + results
│   │       ├── layout.tsx
│   │       └── globals.css
│   ├── worker/       # Background job processor (BullMQ / Redis)
│   └── mcp/          # Helius MCP server (agent tooling layer)
├── packages/
│   └── shared/       # @cabalfinder/shared — enums, defaults, types
├── src/              # Legacy V1 scanner (still functional)
├── config/
│   ├── tokens.json   # Monitored SPL token list
│   └── pools.json    # Raydium pool vault accounts
├── infra/
│   └── docker-compose.v2.yml   # Local Postgres + Redis
├── scripts/          # Pool refresh, live smoke tests, ZAP security
├── tests/
│   ├── e2e/          # Playwright dashboard tests
│   └── load/         # k6 load tests
└── docs/             # V2 design docs, MCP setup guide
```

### Data Flow

```
User (browser) → Next.js (port 3000)
                      ↓
              Fastify API (port 4000)
                      ↓
        ┌─────────────┴─────────────┐
        │                           │
  Helius DAS/RPC              Supabase (Postgres)
  Helius Wallet API           ├── tokens
  (on-chain data)             ├── wallets
                              ├── wallet_positions
                              ├── holder_snapshots
                              ├── control_edges
                              ├── scan_runs
                              ├── scan_results
                              └── alerts
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API Server | [Fastify](https://fastify.dev/) + TypeScript |
| Web Dashboard | [Next.js 14](https://nextjs.org/) (App Router) |
| Database ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL via PgBouncer) |
| Job Queue | [BullMQ](https://bullmq.io/) + Redis |
| On-chain Data | [Helius](https://helius.dev/) DAS API + Wallet API + MCP |
| Testing | Playwright (E2E) + k6 (load) + OWASP ZAP (security) |
| Monorepo | npm workspaces |
| Language | TypeScript 5.8 |

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Docker Desktop (for local Postgres + Redis) **or** external Postgres/Redis URLs
- Helius API key → [helius.dev](https://helius.dev)
- Supabase project → [supabase.com](https://supabase.com)

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```bash
# --- Required ---
DATABASE_URL="postgres://postgres.<project_ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
HELIUS_API_KEY=your_primary_helius_api_key

# --- Optional fallback keys (comma-separated) ---
HELIUS_FALLBACK_API_KEYS=backup_key_one,backup_key_two

# --- Optional but recommended ---
REDIS_URL=redis://localhost:6379
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_IDS=
```

### 3. Run database migrations

```bash
npm run db:generate   # generates SQL from Drizzle schema
npm run db:migrate    # applies to Supabase
```

### 4. Start development

Fastest path (API + web, auto-starts Docker infra):

```bash
npm run dev:v2
```

Without Docker (use your own Postgres/Redis):

```bash
npm run dev:v2:no-infra
```

Full stack including background worker:

```bash
npm run dev:v2:full
```

| Command | What runs |
|---------|-----------|
| `npm run dev:api` | Fastify API on port 4000 |
| `npm run dev:web` | Next.js dashboard on port 3000 |
| `npm run dev:worker` | BullMQ job processor |
| `npm run dev:mcp` | Helius MCP agent server |

### macOS one-click launchers

Double-click in Finder — no terminal required:

- `Start Cabalfinder.command` → API + web
- `Start Cabalfinder Full.command` → API + worker + web
- `Stop Cabalfinder.command` → stop all services

Logs land in `.run/logs/`. The app opens at `http://localhost:3000`.

---

## API Reference

Base: `http://localhost:4000`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness check |
| `GET` | `/v1/system/status` | Provider config + tuning params |
| `POST` | `/v1/scans/active` | Run a new holder-intelligence scan |
| `GET` | `/v1/scans/active/:scanRunId` | Retrieve a persisted scan by ID |
| `GET` | `/v1/scans/active/:scanRunId/overlap/:mint` | Overlap wallets for a result token |

**Active scan request:**

```bash
curl -X POST http://localhost:4000/v1/scans/active \
  -H 'content-type: application/json' \
  -d '{"mint":"So11111111111111111111111111111111111111112","topResults":10}'
```

**Active scan response shape:**

```json
{
  "ok": true,
  "scanRunId": "<uuid>",
  "sourceToken": { "mint": "...", "symbol": "SOL", "marketCapUsd": 80000000000 },
  "results": [
    {
      "mint": "...", "ca": "...", "symbol": "BONK",
      "marketCapUsd": 1200000, "overlapHolderCount": 12,
      "totalUsdHeld": 45000, "controlPct": 0.031, "score": 0.741,
      "scoreBreakdown": { "normalizedControlPct": 0.8, "normalizedTotalUsdHeld": 0.6, "normalizedOverlapCount": 0.5, "finalScore": 0.741 }
    }
  ],
  "summary": { "scannedHolderCount": 50, "returnedResultCount": 10, "copyCAs": "mint1,mint2,..." },
  "warnings": []
}
```

---

## Database Schema

8 tables managed by Drizzle ORM, backed by Supabase PostgreSQL:

| Table | Purpose |
|-------|---------|
| `tokens` | SPL token metadata + market data |
| `wallets` | Unique wallet addresses + labels |
| `wallet_positions` | Point-in-time token balances per wallet |
| `holder_snapshots` | Top-N holder rankings per token per timestamp |
| `control_edges` | Cross-token control metric series |
| `alerts` | Fired alerts with Telegram delivery status |
| `scan_runs` | Scan job lifecycle (pending → complete) |
| `scan_results` | Ranked co-held tokens per scan run |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | Supabase PostgreSQL connection string (PgBouncer transaction mode) |
| `HELIUS_API_KEY` | ✅ | — | Primary Helius API key for DAS + Wallet API |
| `HELIUS_FALLBACK_API_KEYS` | | — | Comma-separated backup Helius API keys used when primary key fails/quota-exhausts |
| `REDIS_URL` | ✅ | `redis://localhost:6379` | Redis for BullMQ job queues |
| `API_HOST` | | `0.0.0.0` | Fastify bind address |
| `API_PORT` | | `4000` | Fastify port |
| `NEXT_PUBLIC_API_BASE_URL` | | `http://localhost:4000` | Frontend → API URL |
| `HELIUS_HOLDER_PAGE_LIMIT` | | `1000` | Holders fetched per page |
| `HELIUS_MAX_HOLDER_PAGES` | | `10` | Max pages per holder fetch |
| `HELIUS_WALLET_PAGE_LIMIT` | | `100` | Positions per wallet page |
| `HELIUS_MAX_WALLET_PAGES` | | `3` | Max wallet enrichment pages |
| `TOP_HOLDER_LIMIT` | | `50` | Holder group size |
| `TRACKING_MARKET_CAP_MIN_USD` | | `10000` | Min market cap for tracking |
| `ACTIVE_SCAN_MARKET_CAP_MIN_USD` | | `5000` | Min market cap for scan results |
| `ALERT_CONTROL_THRESHOLD` | | `0.2` | Control % that triggers alert |
| `WORKER_CONCURRENCY` | | `4` | BullMQ worker concurrency |
| `TELEGRAM_BOT_TOKEN` | | — | Telegram bot for alerts |
| `TELEGRAM_CHAT_IDS` | | — | Comma-separated chat IDs |
| `RPC_URL` | | Solana mainnet | Solana RPC endpoint |

---

## Testing

```bash
# Type-check + build all workspaces
npm run check:v2

# Live smoke test against real RPC
npm run test:live

# Live smoke including snapshot/correlation mutations
npm run test:live:mutations

# E2E tests (Playwright)
npm run test:e2e

# Load test (k6)
npm run test:load

# Security scan (OWASP ZAP)
npm run test:security
```

See [`TESTING.md`](./TESTING.md) for the full test matrix.

---

## Legacy V1 Scanner

The original pure on-chain scanner (no database) still works:

```bash
# Run snapshot + correlation + alerts once
npm run start -- run-once

# Only refresh holder snapshots
npm run start -- snapshot

# Active scan for one token mint
npm run start -- scan <TOKEN_MINT>

# Web dashboard (legacy, port 8787)
npm run web
```

V1 uses on-chain DEX pool vault reserves (from `config/pools.json`) for price — no Dexscreener or Birdeye dependency.

---

## Deployment

### GitHub

- **Repository:** [github.com/WinterSoldier91/Cabalfinder](https://github.com/WinterSoldier91/Cabalfinder)
- **Branch:** `main`
- **Last commit:** `ddd1043` — "Initial V2 Migration for Vercel and Supabase" (2026-03-25)
- **Status:** ✅ Pushed and synced (`vercel.json` present in repo root)

### Supabase

- **Project Ref:** `xtkrpaytwllwhbuohnyu`
- **Region:** `aws-us-east-1`
- **Dashboard:** [supabase.com/dashboard/project/xtkrpaytwllwhbuohnyu](https://supabase.com/dashboard/project/xtkrpaytwllwhbuohnyu)
- **Connection mode:** PgBouncer transaction mode (port 6543)

> ⚠️ **If you see "Tenant or user not found":** The Supabase free tier **pauses projects after 7 days of inactivity**. Go to the dashboard → click **Restore project** → then run `npm run db:migrate`.

### Helius

- **MCP setup:** See [`docs/MCP_SETUP.md`](./docs/MCP_SETUP.md)
- **Provider strategy:** Helius-first. Birdeye and Dexscreener are not used in V2.

---

## Refreshing Pool Config

After changing `config/tokens.json`, regenerate pool data from Raydium's live API:

```bash
npm run refresh:pools
```

---

## Notes

- The public Solana RPC is rate-limited. Use a dedicated RPC (e.g. Helius) for production.
- On the public RPC, active scans are capped to top-20 holders and may return `429` errors.
- `athUsd` is best-effort from Helius payloads; when not available it is `null` with a scoped warning.
- For production time-series analytics at scale, consider ClickHouse instead of PostgreSQL.

---

## Further Reading

- [V2 Design Plan](./docs/V2_SOLANA_HOLDER_INTELLIGENCE_PLAN.md)
- [MCP Setup](./docs/MCP_SETUP.md)
- [Testing Guide](./TESTING.md)
