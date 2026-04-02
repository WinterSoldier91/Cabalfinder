import { and, eq, sql } from "drizzle-orm";
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
    
    const upsertTokens = async (tokensArr: {
      mint: string;
      symbol?: string;
      name?: string;
      marketCapUsd?: number | null;
      athUsd?: number | null;
    }[]): Promise<Map<string, { id: string; mint: string }>> => {
      if (tokensArr.length === 0) return new Map();
      const rows = await tx
        .insert(tokens)
        .values(tokensArr.map(t => ({
          mint: t.mint,
          symbol: t.symbol,
          name: t.name,
          currentMarketCapUsd: t.marketCapUsd ?? null,
          athUsd: t.athUsd ?? null,
          updatedAt: new Date()
        })))
        .onConflictDoUpdate({
          target: tokens.mint,
          set: {
            symbol: sql`excluded.symbol`,
            name: sql`excluded.name`,
            currentMarketCapUsd: sql`excluded.current_market_cap_usd`,
            athUsd: sql`excluded.ath_usd`,
            updatedAt: new Date()
          }
        })
        .returning({ id: tokens.id, mint: tokens.mint });
      
      const map = new Map<string, { id: string; mint: string }>();
      for (const row of rows) {
        map.set(row.mint, row);
      }
      return map;
    };

    const upsertWallets = async (addresses: string[]): Promise<Map<string, { id: string; address: string }>> => {
      if (addresses.length === 0) return new Map();
      const rows = await tx
        .insert(wallets)
        .values(addresses.map(a => ({ address: a, lastSeenAt: new Date() })))
        .onConflictDoUpdate({
          target: wallets.address,
          set: { lastSeenAt: new Date() }
        })
        .returning({ id: wallets.id, address: wallets.address });
      
      const map = new Map<string, { id: string; address: string }>();
      for (const row of rows) {
        map.set(row.address, row);
      }
      return map;
    };

    const sourceTokenMap = await upsertTokens([params.response.sourceToken]);
    const sourceToken = sourceTokenMap.get(params.response.sourceToken.mint)!;

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
          sourceTokenId: sourceToken.id,
          sourceTokenMint: params.response.sourceToken.mint,
          topHolderLimit: params.response.summary.topHolderLimit,
          marketCapFloorUsd: params.response.summary.marketCapFloorUsd
        }
      })
      .onConflictDoNothing();

    const uniqueSourceWallets = [...new Set(params.sourceHolders.map(h => h.owner))];
    const sourceWalletMap = await upsertWallets(uniqueSourceWallets);

    if (params.sourceHolders.length > 0) {
      const holderSnaps = params.sourceHolders.map(holder => {
        const wallet = sourceWalletMap.get(holder.owner)!;
        return {
          tokenId: sourceToken.id,
          walletId: wallet.id,
          snapshotTime: params.snapshotTime,
          holderRank: holder.rank,
          amount: holder.uiAmount,
          shareOfSupply: holder.share
        };
      });
      await tx.insert(holderSnapshots).values(holderSnaps).onConflictDoNothing();
    }

    await tx.delete(scanResults).where(eq(scanResults.scanRunId, params.scanRunId));

    const uniqueResultTokensMap = new Map<string, any>();
    for (const r of params.response.results) {
      if (!uniqueResultTokensMap.has(r.mint)) {
        uniqueResultTokensMap.set(r.mint, {
          mint: r.mint,
          symbol: r.symbol,
          name: r.name,
          marketCapUsd: r.marketCapUsd,
          athUsd: r.athUsd
        });
      }
    }
    const resultTokenRowMap = await upsertTokens(Array.from(uniqueResultTokensMap.values()));

    if (params.response.results.length > 0) {
      const resultRows = params.response.results.map((result, index) => {
        const tokenRow = resultTokenRowMap.get(result.mint)!;
        return {
          scanRunId: params.scanRunId,
          tokenId: tokenRow.id,
          resultRank: index + 1,
          overlapWalletCount: result.overlapHolderCount,
          totalUsdHeld: result.totalUsdHeld,
          supplyControlPct: result.controlPct,
          marketCapUsd: result.marketCapUsd,
          athUsd: result.athUsd ?? null,
          weightedScore: result.score
        };
      });
      await tx.insert(scanResults).values(resultRows);
    }

    const uniqueContribWallets = [...new Set(params.resultContributors.map(c => c.walletAddress))];
    const contribWalletMap = await upsertWallets(uniqueContribWallets);

    const uniqueContribTokensMap = new Map<string, any>();
    for (const c of params.resultContributors) {
      if (!uniqueContribTokensMap.has(c.mint)) {
        uniqueContribTokensMap.set(c.mint, {
          mint: c.mint,
          symbol: c.symbol,
          name: c.name,
          marketCapUsd: c.marketCapUsd,
          athUsd: c.athUsd
        });
      }
    }
    const contribTokenRowMap = await upsertTokens(Array.from(uniqueContribTokensMap.values()));

    if (params.resultContributors.length > 0) {
      const positionRows = params.resultContributors.map(contributor => {
        const wallet = contribWalletMap.get(contributor.walletAddress)!;
        const token = contribTokenRowMap.get(contributor.mint)!;
        return {
          walletId: wallet.id,
          tokenId: token.id,
          balance: contributor.amountUi,
          usdValue: contributor.usdValue,
          source: "active_scan",
          observedAt: params.snapshotTime
        };
      });
      
      const uniquePositionRowsMap = new Map<string, any>();
      for (const row of positionRows) {
        const key = `${row.walletId}-${row.tokenId}-${row.observedAt.toISOString()}`;
        if (!uniquePositionRowsMap.has(key)) {
           uniquePositionRowsMap.set(key, row);
        }
      }
      const finalPositionRows = Array.from(uniquePositionRowsMap.values());
      
      if (finalPositionRows.length > 0) {
         await tx.insert(walletPositions).values(finalPositionRows);
      }
    }

    await tx
      .update(scanRuns)
      .set({
        status: "succeeded",
        completedAt: new Date(),
        metadata: {
          warnings: params.response.warnings,
          eligibleResultCount: params.response.summary.eligibleResultCount,
          returnedResultCount: params.response.summary.returnedResultCount,
          sourceTokenId: sourceToken.id,
          sourceTokenMint: params.response.sourceToken.mint,
          scannedHolderCount: params.response.summary.scannedHolderCount,
          topHolderLimit: params.response.summary.topHolderLimit,
          marketCapFloorUsd: params.response.summary.marketCapFloorUsd,
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
      metadata: { error }
    })
    .onConflictDoUpdate({
      target: scanRuns.id,
      set: {
        status: "failed",
        completedAt: new Date(),
        metadata: { error }
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

  let sourceToken = null;
  const sourceTokenId = run.metadata.sourceTokenId as string | undefined;
  if (sourceTokenId) {
    const [tokenRow] = await db
      .select({
        mint: tokens.mint,
        symbol: tokens.symbol,
        name: tokens.name,
        marketCapUsd: tokens.currentMarketCapUsd,
        athUsd: tokens.athUsd
      })
      .from(tokens)
      .where(eq(tokens.id, sourceTokenId))
      .limit(1);
    if (tokenRow) {
      sourceToken = tokenRow;
    }
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
    sourceToken,
    results: rows
  };
}

export async function getSourceHolders(scanRunId: string) {
  const [run] = await db.select().from(scanRuns).where(eq(scanRuns.id, scanRunId)).limit(1);
  if (!run) return [];

  const sourceTokenId = run.metadata.sourceTokenId as string;
  if (!sourceTokenId) return [];

  const rows = await db
    .select({
      address: wallets.address,
      rank: holderSnapshots.holderRank,
      amount: holderSnapshots.amount,
      share: holderSnapshots.shareOfSupply
    })
    .from(holderSnapshots)
    .innerJoin(wallets, eq(holderSnapshots.walletId, wallets.id))
    .where(and(eq(holderSnapshots.tokenId, sourceTokenId), eq(holderSnapshots.snapshotTime, run.startedAt)))
    .orderBy(holderSnapshots.holderRank);

  return rows;
}

export async function getOverlapWallets(scanRunId: string, resultMint: string) {
  const [run] = await db.select().from(scanRuns).where(eq(scanRuns.id, scanRunId)).limit(1);
  if (!run) return [];

  const sourceTokenId = run.metadata.sourceTokenId as string;
  if (!sourceTokenId) return [];

  const [resultToken] = await db.select().from(tokens).where(eq(tokens.mint, resultMint)).limit(1);
  if (!resultToken) return [];

  const overlap = await db
    .select({
      address: wallets.address,
      rank: holderSnapshots.holderRank,
      amount: walletPositions.balance,
      usdValue: walletPositions.usdValue
    })
    .from(wallets)
    .innerJoin(holderSnapshots, eq(holderSnapshots.walletId, wallets.id))
    .innerJoin(walletPositions, eq(walletPositions.walletId, wallets.id))
    .where(
      and(
        eq(holderSnapshots.tokenId, sourceTokenId),
        eq(holderSnapshots.snapshotTime, run.startedAt),
        eq(walletPositions.tokenId, resultToken.id),
        eq(walletPositions.observedAt, run.startedAt)
      )
    )
    .orderBy(holderSnapshots.holderRank);

  return overlap;
}
