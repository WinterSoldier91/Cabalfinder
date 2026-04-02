export const launchProtocols = [
  "pump",
  "letsbonk",
  "launchlab",
  "believe",
  "moonshot",
  "meteora_dbc",
  "jupiter_studio",
  "unknown"
] as const;

export type TokenLaunchProtocol = (typeof launchProtocols)[number];

export const liquidityProtocols = [
  "pump_amm",
  "raydium",
  "meteora_amm",
  "meteora_damm_v2",
  "orca",
  "jupiter_routed",
  "multi",
  "unknown"
] as const;

export type LiquidityProtocol = (typeof liquidityProtocols)[number];

export const migrationStates = ["bonding_curve", "final_stretch", "migrated", "unknown"] as const;
export type MigrationState = (typeof migrationStates)[number];

export const jobStatuses = ["pending", "running", "succeeded", "failed"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const queueNames = {
  tokenUniverseRefresh: "token-universe-refresh",
  holderSnapshot: "holder-snapshot",
  controlComputation: "control-computation",
  activeScan: "active-scan",
  alertDelivery: "alert-delivery"
} as const;

export const v2Defaults = {
  trackingMarketCapMinUsd: 10_000,
  activeScanMarketCapMinUsd: 5_000,
  controlAlertThresholdPct: 0.2,
  topHolderLimit: 50,
  activeScanWeights: {
    holderOverlapPct: 0.5,
    controlPct: 0.3,
    valueSharePct: 0.2
  }
} as const;

export interface ActiveScanScoreInput {
  holderOverlapPct: number;
  controlPct: number;
  valueSharePct: number;
}

export interface ActiveScanScoreBreakdown {
  holderOverlapPct: number;
  controlPct: number;
  valueSharePct: number;
  finalScore: number;
}

export interface RankedCoHeldToken {
  mint: string;
  symbol?: string;
  name?: string;
  marketCapUsd: number;
  athUsd?: number | null;
  overlapHolderCount: number;
  holderOverlapPct: number;
  totalUsdHeld: number;
  valueSharePct: number;
  controlPct: number;
  score: number;
}

export interface ActiveScanResult {
  mint: string;
  ca: string;
  symbol?: string;
  name?: string;
  marketCapUsd: number;
  athUsd?: number | null;
  overlapHolderCount: number;
  holderOverlapPct: number;
  totalUsdHeld: number;
  valueSharePct: number;
  controlPct: number;
  score: number;
  scoreBreakdown: ActiveScanScoreBreakdown;
}

export interface ActiveScanResponse {
  sourceToken: {
    mint: string;
    symbol?: string;
    name?: string;
    marketCapUsd?: number | null;
    athUsd?: number | null;
  };
  results: ActiveScanResult[];
  summary: {
    scannedHolderCount: number;
    returnedResultCount: number;
    eligibleResultCount: number;
    topHolderLimit: number;
    marketCapFloorUsd: number;
    copyCAs: string;
  };
  warnings: string[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

export function calculateActiveScanScore(input: ActiveScanScoreInput): ActiveScanScoreBreakdown {
  const holderOverlapPct = clamp01(input.holderOverlapPct);
  const controlPct = clamp01(input.controlPct);
  const valueSharePct = clamp01(input.valueSharePct);

  const finalScore =
    holderOverlapPct * v2Defaults.activeScanWeights.holderOverlapPct +
    controlPct * v2Defaults.activeScanWeights.controlPct +
    valueSharePct * v2Defaults.activeScanWeights.valueSharePct;

  return {
    holderOverlapPct,
    controlPct,
    valueSharePct,
    finalScore: Number(finalScore.toFixed(6))
  };
}

export const providerNames = {
  helius: "Helius DAS + RPC",
  heliusWallet: "Helius Wallet API",
  heliusMcp: "Helius MCP",
  telegram: "Telegram Bot API",
  postgres: "PostgreSQL + TimescaleDB",
  redis: "Redis"
} as const;
