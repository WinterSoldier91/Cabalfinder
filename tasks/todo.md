# Feature: Stablecoin Ignore Filter

## Tasks
- [x] **Environment Variables**: Add `USDC_MINT` and `USDT_MINT` to the Zod schema in `apps/api/src/env.ts` so they are safely exposed to the application.
- [x] **Service Filter**: Define an `IGNORED_MINTS` Set in `apps/api/src/services/activeScanService.ts`.
- [x] **Wallet Expansion Loop**: Update the `getWalletFungiblePositions` processing loop in `activeScanService.ts` to `continue` (skip) any token that matches the ignored set, entirely blocking it from ranking or showing up as a correlated signal.
