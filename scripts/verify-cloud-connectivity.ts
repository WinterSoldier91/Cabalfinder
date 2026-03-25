import { config as loadEnv } from "dotenv";
import { db } from "../apps/api/src/db/client.js";
import { tokens } from "../apps/api/src/db/schema.js";

loadEnv();

async function runTest() {
  console.log("Starting Cloud Connectivity Test...");

  // 1. Supabase Connection Test
  try {
    console.log("Testing Supabase connectivity...");
    const result = await db.select().from(tokens).limit(1);
    console.log("✓ Supabase connected successfully.");
  } catch (error) {
    console.error("✗ Supabase connection failed:", error instanceof Error ? error.message : error);
  }

  // 2. Helius Connectivity Test
  try {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      console.warn("! HELIUS_API_KEY not set, skipping Helius test.");
    } else {
      console.log("Testing Helius connectivity...");
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
      const res = await fetch(heliusUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "test",
          method: "getAsset",
          params: { id: "So11111111111111111111111111111111111111112" }
        })
      });

      if (res.ok) {
        console.log("✓ Helius reachable and API key is valid.");
      } else {
        const body = await res.text();
        console.error(`✗ Helius returned error (${res.status}): ${body}`);
      }
    }
  } catch (error) {
    console.error("✗ Helius connectivity failed:", error instanceof Error ? error.message : error);
  }

  process.exit(0);
}

runTest();
