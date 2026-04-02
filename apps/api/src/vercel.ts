/**
 * Vercel Serverless Function entry-point for the Cabalfinder API.
 *
 * Wraps the Fastify app as a plain Node.js http handler so Vercel can invoke
 * it as a serverless function for every /v1/* and /healthz route.
 *
 * On Vercel:
 *   - Env vars are injected from the project dashboard (no .env file needed).
 *   - Redis is NOT required for these API routes; only the worker uses it.
 */

import type { FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer } from "./server.js";

// Ensure REDIS_URL satisfies the env schema default on cold starts.
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:6379";
}

// Singleton — reused across warm lambda invocations.
let instance: FastifyInstance | null = null;
let initialising = false;
let initError: unknown = null;

async function getServer(): Promise<FastifyInstance> {
  if (instance) return instance;

  if (initError) {
    // Reset so next warm invocation can retry
    initError = null;
  }

  if (initialising) {
    // Spin-wait for the ongoing cold-start to finish
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    return getServer();
  }

  initialising = true;
  try {
    const app = await buildServer();
    await app.ready();
    instance = app;
    return app;
  } catch (err) {
    initError = err;
    throw err;
  } finally {
    initialising = false;
  }
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const fastify = await getServer();
  fastify.server.emit("request", req, res);
}
