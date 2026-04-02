import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_SCAN_MINT = "2odHeumkiJx46YyNHeZvDjMwsoNhpAgFQuipT96npump";
const DEFAULT_BASE_URL = "http://127.0.0.1:4000";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T;
  return { status: response.status, body };
}

async function main() {
  const baseUrl = process.env.BASE_URL || DEFAULT_BASE_URL;
  const scanMint = process.env.SCAN_MINT || DEFAULT_SCAN_MINT;

  console.log(`--- Cabalfinder V2 Smoke Test ---`);
  console.log(`Target: ${baseUrl}`);
  console.log(`Mint:   ${scanMint}\n`);

  try {
    // 1. Health check
    console.log(`[1] Checking /healthz...`);
    const health = await fetchJson<{ ok: boolean }>(`${baseUrl}/healthz`);
    if (health.status !== 200 || !health.body.ok) throw new Error(`Healthz failed: ${JSON.stringify(health.body)}`);
    console.log(`PASS: Service is healthy\n`);

    // 2. System Status
    console.log(`[2] Checking /v1/system/status...`);
    const status = await fetchJson<{ ok: boolean; thresholds: any; providers: any }>(`${baseUrl}/v1/system/status`);
    if (status.status !== 200 || !status.body.ok) throw new Error(`Status failed: ${JSON.stringify(status.body)}`);
    console.log(`PASS: Thresholds: MCL=$${status.body.thresholds.activeScanMarketCapMinUsd}`);
    const missing = Object.entries(status.body.providers).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length > 0) console.log(`WARN: Missing providers: ${missing.join(", ")}`);
    console.log("");

    // 3. Active Scan
    console.log(`[3] Running Active Scan for ${scanMint}...`);
    console.log(`(This can take 10-30s depending on Helius rate limits)`);
    const scan = await fetchJson<any>(`${baseUrl}/v1/scans/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: scanMint, topResults: 5 })
    });

    if (scan.status !== 200 || !scan.body.ok) {
      throw new Error(`Scan failed (${scan.status}): ${JSON.stringify(scan.body)}`);
    }

    console.log(`PASS: Found ${scan.body.results.length} correlated tokens`);
    console.log(`Scan Run ID: ${scan.body.scanRunId}`);
    
    if (scan.body.results.length > 0) {
      const top = scan.body.results[0];
      console.log(`Top Signal: ${top.symbol || top.mint} | Score: ${top.score.toFixed(3)} | Control: ${(top.controlPct * 100).toFixed(1)}%`);
    }

    // 4. Lookup
    console.log(`\n[4] Verifying scan lookup for ID ${scan.body.scanRunId}...`);
    const lookup = await fetchJson<any>(`${baseUrl}/v1/scans/active/${scan.body.scanRunId}`);
    if (lookup.status !== 200 || !lookup.body.ok) throw new Error(`Lookup failed: ${JSON.stringify(lookup.body)}`);
    if (lookup.body.results.length !== scan.body.results.length) throw new Error(`Lookup result count mismatch`);
    if (!lookup.body.summary || !lookup.body.sourceToken) throw new Error(`Lookup missing normalized summary/sourceToken fields`);
    console.log(`PASS: Lookup normalized matching POST response\n`);

    console.log(`SUCCESS: All V2 smoke tests passed.`);

  } catch (error) {
    console.error(`\nFAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
