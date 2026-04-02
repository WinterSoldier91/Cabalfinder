import type { FastifyInstance } from "fastify";
import { calculateActiveScanScore } from "@cabalfinder/shared";
import { z } from "zod";

const scorePreviewSchema = z.object({
  holderOverlapPct: z.number().nonnegative().max(1),
  controlPct: z.number().nonnegative().max(1),
  valueSharePct: z.number().nonnegative().max(1)
});

export async function registerScoringRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/scoring/active-scan", async (request) => {
    const payload = scorePreviewSchema.parse(request.body);
    return {
      ok: true,
      input: payload,
      output: calculateActiveScanScore(payload)
    };
  });
}
