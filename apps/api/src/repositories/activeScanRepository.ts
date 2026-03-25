import { eq, sql } from "drizzle-orm";
import type { ActiveScanResponse } from "@cabalfinder/shared";
import { db } from "../db/client.js";
import { holderSnapshots, scanResults, scanRuns, tokens, walletPositions, wallets } from "../db/schema.js";

interface PersistScanParams {
  inputMint: string;
  scanRunId: string;
  snapshotTime: Date;
  response: ActiveScanResponse;
  sourceHolders: Array<{
    owner: string;
    rank: number;
    uiAmount: number;
    share: number;
  }>;
  resultContributors: Array<{
    walletAddress: string;
    mint: string;
    symbol?: string;
    name?: string;
    marketCapUsd: number;
    athUsd: number | null;
    amountUi: number;
    usdValue: number | null;
  }>;
}

export async function persistActiveScan(params: PersistScanParams): Promise<void> {
  await db.transaction(async (tx) => {
    const tokenData = new Map<string, {
      mint: string;
      symbol?: string;
      name?: string;
      marketCapUsd?: number | null;
      athUsd?: number | null;
    }>();

    const walletAddresses = new Set<string>();

    // 1. Collect all unique tokens and wallets
    tokenData.set(params.response.sourceToken.mint, params.response.sourceToken);

    for (const holder of params.sourceHolders) {
      walletAddresses.add(holder.owner);
    }

    for (const result of params.response.results) {
      tokenData.set(result.mint, {
        mint: result.mint,
        symbol: result.symbol,
        name: result.name,
        marketCapUsd: result.marketCapUsd,
        athUsd: result.athUsd
      });
    }

    for (const contributor of params.resultContributors) {
      walletAddresses.add(contributor.walletAddress);
      tokenData.set(contributor.mint, {
        mint: contributor.mint,
        symbol: contributor.symbol,
        name: contributor.name,
        marketCapUsd: contributor.marketCapUsd,
        athUsd: contributor.athUsd
      });
    }

    // 2. Batch upsert tokens
    const tokenRows = await tx
      .insert(tokens)
      .values(
        Array.from(tokenData.values()).map((t) => ({
          mint: t.mint,
          symbol: t.symbol,
          name: t.name,
          currentMarketCapUsd: t.marketCapUsd ?? null,
          athUsd: t.athUsd ?? null,
          updatedAt: new Date()
        }))
      )
      .onConflictDoUpdate({
        target: tokens.mint,
        set: {
          symbol: sql`EXCLUDED.symbol`,
          name: sql`EXCLUDED.name`,
          currentMarketCapUsd: sql`EXCLUDED.current_market_cap_usd`,
          athUsd: sql`EXCLUDED.ath_usd`,
          updatedAt: new Date()
        }
      })
      .returning({
        id: tokens.id,
        mint: tokens.mint
      });

    const tokenCache = new Map(tokenRows.map((r) => [r.mint, r.id]));

    // 3. Batch upsert wallets
    const walletRows = await tx
      .insert(wallets)
      .values(
        Array.from(walletAddresses).map((address) => ({
          address,
          lastSeenAt: new Date()
        }))
      )
      .onConflictDoUpdate({
        target: wallets.address,
        set: {
          lastSeenAt: new Date()
        }
      })
      .returning({
        id: wallets.id,
        address: wallets.address
      });

    const walletCache = new Map(walletRows.map((r) => [r.address, r.id]));

    const sourceTokenId = tokenCache.get(params.response.sourceToken.mint)!;

    // 4. Create scan run
    await tx
      .insert(scanRuns)
      .values({
        id: params.scanRunId,
        inputMint: params.inputMint,
        status: "running",
        startedAt: params.snapshotTime,
        snapshotVersion: params.snapshotTime.toISOString(),
        metadata: {
          warnings: params.response.warnings,
          sourceTokenMint: params.response.sourceToken.mint,
          topHolderLimit: params.response.summary.topHolderLimit,
          marketCapFloorUsd: params.response.summary.marketCapFloorUsd
        }
      })
      .onConflictDoNothing();

    // 5. Batch insert holder snapshots
    if (params.sourceHolders.length > 0) {
      await tx
        .insert(holderSnapshots)
        .values(
          params.sourceHolders.map((holder) => ({
            tokenId: sourceTokenId,
            walletId: walletCache.get(holder.owner)!,
            snapshotTime: params.snapshotTime,
            holderRank: holder.rank,
            amount: holder.uiAmount,
            shareOfSupply: holder.share
          }))
        )
        .onConflictDoNothing();
    }

    // 6. Delete old results (just in case) and batch insert new ones
    await tx.delete(scanResults).where(eq(scanResults.scanRunId, params.scanRunId));

    if (params.response.results.length > 0) {
      await tx.insert(scanResults).values(
        params.response.results.map((result, index) => ({
          scanRunId: params.scanRunId,
          tokenId: tokenCache.get(result.mint)!,
          resultRank: index + 1,
          overlapWalletCount: result.overlapHolderCount,
          totalUsdHeld: result.totalUsdHeld,
          supplyControlPct: result.controlPct,
          marketCapUsd: result.marketCapUsd,
          athUsd: result.athUsd ?? null,
          weightedScore: result.score
        }))
      );
    }

    // 7. Batch insert wallet positions
    if (params.resultContributors.length > 0) {
      await tx.insert(walletPositions).values(
        params.resultContributors.map((contributor) => ({
          walletId: walletCache.get(contributor.walletAddress)!,
          tokenId: tokenCache.get(contributor.mint)!,
          balance: contributor.amountUi,
          usdValue: contributor.usdValue,
          source: "active_scan",
          observedAt: params.snapshotTime
        }))
      );
    }

    // 8. Mark scan run as succeeded
    await tx
      .update(scanRuns)
      .set({
        status: "succeeded",
        completedAt: new Date(),
        metadata: {
          warnings: params.response.warnings,
          eligibleResultCount: params.response.summary.eligibleResultCount,
          returnedResultCount: params.response.summary.returnedResultCount,
          sourceTokenId: sourceTokenId,
          scannedHolderCount: params.response.summary.scannedHolderCount,
          copyCAs: params.response.summary.copyCAs
        }
      })
      .where(eq(scanRuns.id, params.scanRunId));
  });
}

export async function markActiveScanFailed(scanRunId: string, inputMint: string, error: string): Promise<void> {
  await db
    .insert(scanRuns)
    .values({
      id: scanRunId,
      inputMint,
      status: "failed",
      startedAt: new Date(),
      completedAt: new Date(),
      metadata: {
        error
      }
    })
    .onConflictDoUpdate({
      target: scanRuns.id,
      set: {
        status: "failed",
        completedAt: new Date(),
        metadata: {
          error
        }
      }
    });
}

export async function getActiveScanById(scanRunId: string) {
  const [run] = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.id, scanRunId))
    .limit(1);

  if (!run) {
    return null;
  }

  const rows = await db
    .select({
      rank: scanResults.resultRank,
      overlapHolderCount: scanResults.overlapWalletCount,
      totalUsdHeld: scanResults.totalUsdHeld,
      supplyControlPct: scanResults.supplyControlPct,
      marketCapUsd: scanResults.marketCapUsd,
      athUsd: scanResults.athUsd,
      weightedScore: scanResults.weightedScore,
      mint: tokens.mint,
      symbol: tokens.symbol,
      name: tokens.name
    })
    .from(scanResults)
    .innerJoin(tokens, eq(scanResults.tokenId, tokens.id))
    .where(eq(scanResults.scanRunId, scanRunId))
    .orderBy(scanResults.resultRank);

  return {
    run,
    results: rows
  };
}
