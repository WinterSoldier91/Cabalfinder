# Cabalfinder Audit Lessons

## 1. Drizzle ORM and Postgres Transactions
- **Pattern:** Using sequential `for (const x of array) await db.insert...` in Drizzle Node-Pg driver.
- **Problem:** Takes O(N) network round-trips and is highly inefficient. Furthermore, if a script crashes midway, the database is left with orphaned or partially committed states because it lacks a unified transaction wrapper.
- **Solution:** Always wrap complex, multi-entity insertion workflows (like scan persistence) in `await db.transaction(async (tx) => { ... })`. Pre-fetch dependent unique entities concurrently in memory, map arrays to DB rows, and perform single bulk inserts using `tx.insert(...).values(array)`.

## 2. Returning Relational Data in REST responses
- **Pattern:** Baseline API endpoints fetching primarily from a single table (e.g. `scanRuns`).
- **Problem:** Critical shape data like the `sourceToken` metadata was omitted because it lived in the `tokens` table and wasn't natively returned from the cached metadata fields.
- **Solution:** Always perform a focused query or `innerJoin` on related primary tables (like `tokens`) when hydrating API responses to avoid forcing clients into extra lookups.

## 3. Pre-empting High-Noise False Positives
- **Pattern:** Ranking wallet wallet overlaps purely mathematically across all fungible positions.
- **Problem:** Universally held stablecoins (USDC, USDT) statistically appear in every wallet cluster, overwhelming organic signal correlation with sheer ubiquity.
- **Solution:** Implement baseline filtering mechanics (`IGNORED_MINTS`) early in position expansions to strip out noise dynamically before expensive computations or ranking even operate on that data.
