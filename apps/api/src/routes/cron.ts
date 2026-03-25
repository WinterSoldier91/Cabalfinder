import type { FastifyInstance } from "fastify";
import { MonitorService } from "../services/monitorService.js";
import { loadConfig, loadTokenList, loadPoolList } from "../config.js";

export async function registerCronRoutes(app: FastifyInstance) {
  app.post("/v1/cron/monitor", async (request, reply) => {
    // Basic auth check for Vercel Cron
    const authHeader = request.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return reply.code(401).send({ ok: false, error: "Unauthorized" });
    }

    app.log.info("Starting cron monitor task...");

    try {
      const config = loadConfig();
      const tokens = await loadTokenList(config.tokenListPath);
      const pools = await loadPoolList(config.poolListPath);

      const monitor = new MonitorService(config, tokens, pools);

      app.log.info("Running snapshots...");
      await monitor.runSnapshots();

      app.log.info("Running correlation and alerts...");
      const result = await monitor.runCorrelationAndAlerts();

      return {
        ok: true,
        processed: result
      };
    } catch (error) {
      app.log.error(error, "Cron monitor task failed");
      return reply.code(500).send({
        ok: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });
}
