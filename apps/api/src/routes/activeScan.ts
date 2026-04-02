import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { ActiveScanService } from "../services/activeScanService.js";
import { assertValidSolanaMint } from "../lib/solana.js";
import { getActiveScanById, getOverlapWallets } from "../repositories/activeScanRepository.js";

const activeScanRequestSchema = z.object({
  mint: z.string().min(1),
  topResults: z.number().int().min(1).max(25).default(10)
});

const activeScanService = new ActiveScanService();

export async function registerActiveScanRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/scans/active", async (request) => {
    const payload = activeScanRequestSchema.parse(request.body);
    const mint = assertValidSolanaMint(payload.mint);

    const { scanRunId, response } = await activeScanService.run({
      mint,
      topResults: payload.topResults
    });

    return {
      ok: true,
      scanRunId,
      ...response
    };
  });

  app.get("/v1/scans/active/:scanRunId", async (request, reply) => {
    const params = z.object({ scanRunId: z.string().uuid() }).parse(request.params);
    const data = await getActiveScanById(params.scanRunId);
    if (!data) {
      reply.code(404);
      return { ok: false, error: "Scan run not found." };
    }

    return {
      ok: true,
      scanRunId: params.scanRunId,
      sourceToken: {
        mint: data.run.inputMint,
        symbol: data.sourceToken?.symbol,
        name: data.sourceToken?.name,
        marketCapUsd: data.sourceToken?.marketCapUsd,
        athUsd: data.sourceToken?.athUsd
      },
      results: data.results.map((row) => ({
        rank: row.rank,
        mint: row.mint,
        ca: row.mint,
        symbol: row.symbol,
        name: row.name,
        overlapHolderCount: row.overlapHolderCount,
        totalUsdHeld: row.totalUsdHeld,
        controlPct: row.supplyControlPct,
        marketCapUsd: row.marketCapUsd,
        athUsd: row.athUsd,
        score: row.weightedScore
      })),
      summary: {
        scannedHolderCount: data.run.metadata.scannedHolderCount as number ?? 0,
        returnedResultCount: data.results.length,
        eligibleResultCount: data.run.metadata.eligibleResultCount as number ?? data.results.length,
        topHolderLimit: data.run.metadata.topHolderLimit as number ?? 50,
        marketCapFloorUsd: data.run.metadata.marketCapFloorUsd as number ?? 5000,
        copyCAs: data.results.map((row) => row.mint).join("\n")
      },
      warnings: (data.run.metadata.warnings as string[]) ?? []
    };
  });

  app.get("/v1/scans/active/:scanRunId/overlap/:resultMint", async (request, reply) => {
    const params = z.object({
      scanRunId: z.string().uuid(),
      resultMint: z.string().min(1)
    }).parse(request.params);

    const wallets = await getOverlapWallets(params.scanRunId, params.resultMint);
    return { ok: true, wallets };
  });
}
