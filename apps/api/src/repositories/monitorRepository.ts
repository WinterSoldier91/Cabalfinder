import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { alerts, controlEdges, holderSnapshots, tokens, wallets } from "../db/schema.js";
import type { AlertEvent, ControlRow, HolderSnapshot } from "../types.js";

export async function saveHolderSnapshot(snapshot: HolderSnapshot): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Get or create token
    const [token] = await tx
      .insert(tokens)
      .values({
        mint: snapshot.tokenMint,
        totalSupply: snapshot.supplyUi,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: tokens.mint,
        set: {
          totalSupply: snapshot.supplyUi,
          updatedAt: new Date()
        }
      })
      .returning({ id: tokens.id });

    if (!token) return;

    // 2. Batch upsert wallets
    const walletRows = await tx
      .insert(wallets)
      .values(
        snapshot.holders.map((h) => ({
          address: h.owner,
          lastSeenAt: new Date()
        }))
      )
      .onConflictDoUpdate({
        target: wallets.address,
        set: { lastSeenAt: new Date() }
      })
      .returning({ id: wallets.id, address: wallets.address });

    const walletMap = new Map(walletRows.map((w) => [w.address, w.id]));

    // 3. Batch insert snapshots
    const snapshotTime = new Date(snapshot.snapshotTime);
    await tx
      .insert(holderSnapshots)
      .values(
        snapshot.holders.map((h) => ({
          tokenId: token.id,
          walletId: walletMap.get(h.owner)!,
          snapshotTime,
          holderRank: h.rank,
          amount: h.amountUi,
          shareOfSupply: h.share
        }))
      )
      .onConflictDoNothing();
  });
}

export async function readHolderSnapshot(tokenMint: string): Promise<HolderSnapshot | null> {
  const [token] = await db.select().from(tokens).where(eq(tokens.mint, tokenMint)).limit(1);
  if (!token) return null;

  const rows = await db
    .select({
      rank: holderSnapshots.holderRank,
      owner: wallets.address,
      amountUi: holderSnapshots.amount,
      share: holderSnapshots.shareOfSupply,
      snapshotTime: holderSnapshots.snapshotTime
    })
    .from(holderSnapshots)
    .innerJoin(wallets, eq(holderSnapshots.walletId, wallets.id))
    .where(eq(holderSnapshots.tokenId, token.id))
    .orderBy(desc(holderSnapshots.snapshotTime), holderSnapshots.holderRank)
    .limit(50);

  if (rows.length === 0) return null;

  const latestTime = rows[0].snapshotTime;
  const filtered = rows.filter((r) => r.snapshotTime.getTime() === latestTime.getTime());

  return {
    tokenMint,
    snapshotTime: latestTime.toISOString(),
    supplyUi: token.totalSupply ?? 0,
    holders: filtered.map((r) => ({
      rank: r.rank,
      owner: r.owner,
      amountUi: r.amountUi,
      share: r.share
    }))
  };
}

export async function appendControlRows(rows: ControlRow[]): Promise<void> {
  if (rows.length === 0) return;

  const mints = new Set<string>();
  for (const row of rows) {
    mints.add(row.tokenA);
    mints.add(row.tokenB);
  }

  const tokenRows = await db.select().from(tokens).where(sql`${tokens.mint} IN ${Array.from(mints)}`);
  const tokenMap = new Map(tokenRows.map((t) => [t.mint, t.id]));

  await db.insert(controlEdges).values(
    rows.map((row) => ({
      sourceTokenId: tokenMap.get(row.tokenA)!,
      targetTokenId: tokenMap.get(row.tokenB)!,
      snapshotTime: new Date(row.snapshotTime),
      overlapWalletCount: 0, // Not provided in ControlRow
      totalUnitsHeld: 0, // Not provided
      totalUsdHeld: 0, // Not provided
      supplyControlPct: row.control
    }))
  );
}

export async function loadAlertState(): Promise<Record<string, number>> {
  // Simple mock or read from latest control edges
  const latest = await db
    .select({
      mintA: tokens.mint,
      mintB: tokens.mint, // Need to join twice or handle carefully
      control: controlEdges.supplyControlPct,
      key: sql<string>`${tokens.mint} || '|' || (SELECT mint FROM tokens WHERE id = target_token_id)`
    })
    .from(controlEdges)
    .innerJoin(tokens, eq(controlEdges.sourceTokenId, tokens.id))
    .orderBy(desc(controlEdges.snapshotTime))
    .limit(100);

  const state: Record<string, number> = {};
  for (const row of latest) {
    state[row.key] = row.control;
  }
  return state;
}

export async function appendAlerts(events: AlertEvent[]): Promise<void> {
  if (events.length === 0) return;

  const mints = new Set<string>();
  for (const event of events) {
    mints.add(event.tokenA);
    mints.add(event.tokenB);
  }

  const tokenRows = await db.select().from(tokens).where(sql`${tokens.mint} IN ${Array.from(mints)}`);
  const tokenMap = new Map(tokenRows.map((t) => [t.mint, t.id]));

  await db.insert(alerts).values(
    events.map((event) => ({
      sourceTokenId: tokenMap.get(event.tokenA)!,
      targetTokenId: tokenMap.get(event.tokenB)!,
      triggeredAt: new Date(event.snapshotTime),
      previousControlPct: event.prevControl,
      supplyControlPct: event.control,
      overlapWalletCount: event.contributors.length,
      totalUsdHeld: 0,
      topContributors: event.contributors.map((c) => ({ wallet: c.owner, amount: c.amountUi })),
      cooldownKey: `${event.tokenA}|${event.tokenB}`
    }))
  );
}

export async function readRecentAlerts(limit: number): Promise<AlertEvent[]> {
  const rows = await db
    .select({
      tokenA: tokens.mint,
      tokenB: sql<string>`(SELECT mint FROM tokens WHERE id = target_token_id)`,
      snapshotTime: alerts.triggeredAt,
      prevControl: alerts.previousControlPct,
      control: alerts.supplyControlPct,
      contributors: alerts.topContributors
    })
    .from(alerts)
    .innerJoin(tokens, eq(alerts.sourceTokenId, tokens.id))
    .orderBy(desc(alerts.triggeredAt))
    .limit(limit);

  return rows.map((r) => ({
    tokenA: r.tokenA,
    tokenB: r.tokenB,
    snapshotTime: r.snapshotTime.toISOString(),
    prevControl: r.prevControl,
    control: r.control,
    contributors: (r.contributors as any[]).map((c) => ({ owner: c.wallet, amountUi: c.amount }))
  }));
}
