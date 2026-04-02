"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { TokenCard } from "../components/TokenCard";

type StatusResponse = {
  ok: boolean;
  providers: Record<string, boolean>;
  error?: string;
};

type ScanResult = {
  mint: string;
  ca: string;
  symbol?: string;
  name?: string;
  marketCapUsd: number;
  totalUsdHeld: number;
  controlPct: number;
  overlapHolderCount: number;
  score: number;
  athUsd?: number | null;
};

type ScanResponse = {
  ok: boolean;
  error?: string;
  scanRunId: string;
  sourceToken: { mint: string; symbol?: string; name?: string };
  results: ScanResult[];
  summary: { scannedHolderCount: number; copyCAs: string };
  warnings: string[];
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export default function HomePage() {
  const [mint, setMint] = useState("");
  const [scanResponse, setScanResponse] = useState<ScanResponse | null>(null);
  const [statusResponse, setStatusResponse] = useState<StatusResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/v1/system/status`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: StatusResponse) => {
        if (!cancelled) {
          setStatusResponse(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusResponse(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const providerChecks = useMemo(() => {
    if (!statusResponse?.providers) {
      return [] as Array<{ name: string; ok: boolean }>;
    }

    return Object.entries(statusResponse.providers).map(([name, ok]) => ({ name, ok }));
  }, [statusResponse]);

  const allProvidersOk = providerChecks.length > 0 && providerChecks.every((item) => item.ok);

  async function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMint = mint.trim();
    if (!trimmedMint) {
      return;
    }

    setIsScanning(true);
    setScanError(null);

    try {
      const response = await fetch(`${API_BASE}/v1/scans/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint: trimmedMint, topResults: 10 })
      });

      const payload = (await response.json()) as ScanResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Scan failed.");
      }

      setScanResponse(payload);
    } catch (error) {
      setScanResponse(null);
      setScanError(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setIsScanning(false);
    }
  }

  async function copyAllAddresses() {
    if (!scanResponse?.summary.copyCAs) {
      return;
    }

    try {
      await navigator.clipboard.writeText(scanResponse.summary.copyCAs);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // ignored
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 md:px-8">
      <header className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Cabalfinder</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Holder overlap scanner</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Paste a Solana mint to rank co-held tokens by overlap, value concentration, and control percentage.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-zinc-200">
            <span className={`h-2 w-2 rounded-full ${allProvidersOk ? "bg-emerald-400" : "bg-amber-400"}`} />
            {allProvidersOk ? "System ready" : "System check"}
          </div>
          <p className="mt-1 text-zinc-500">{providerChecks.length || 0} providers checked</p>
        </div>
      </header>

      <section className="glass-panel mb-6 p-4 md:p-5">
        <form onSubmit={handleScanSubmit} className="space-y-3">
          <label htmlFor="mint" className="block text-sm font-medium text-zinc-300">
            Token mint
          </label>
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="command-input flex flex-1 items-center gap-3 rounded-xl bg-zinc-950/70 px-3">
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                id="mint"
                type="text"
                name="mint"
                placeholder="So11111111111111111111111111111111111111112"
                className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={isScanning || mint.trim().length === 0}
              className="h-11 min-w-36 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isScanning ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning
                </span>
              ) : (
                "Run scan"
              )}
            </button>
          </div>
        </form>
        {scanError && (
          <p className="error-banner mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {scanError}
          </p>
        )}
      </section>

      {scanResponse && (
        <section className="glass-panel mb-6 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Scan summary</p>
              <p className="mt-1 text-sm text-zinc-300">
                <span className="font-medium text-white">{scanResponse.summary.scannedHolderCount}</span> holders scanned •{" "}
                <span className="font-medium text-white">{scanResponse.results.length}</span> tokens ranked
              </p>
              <p className="mt-1 text-xs text-zinc-500">Run ID: {scanResponse.scanRunId}</p>
            </div>
            <button
              type="button"
              onClick={copyAllAddresses}
              className="h-10 rounded-lg border border-white/15 px-4 text-sm text-zinc-200 transition hover:border-white/30 hover:bg-white/10"
            >
              {copiedAll ? "Copied" : "Copy all CAs"}
            </button>
          </div>
        </section>
      )}

      {scanResponse?.warnings?.length ? (
        <section className="mb-6 space-y-2">
          {scanResponse.warnings.map((warning) => (
            <p key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {warning}
            </p>
          ))}
        </section>
      ) : null}

      <section className="results-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scanResponse?.results.map((result, index) => (
          <TokenCard key={result.mint} result={result} rank={index + 1} scanRunId={scanResponse.scanRunId} />
        ))}
      </section>

      {scanResponse && scanResponse.results.length === 0 ? (
        <p className="mt-6 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
          No correlated tokens passed the current market-cap filters.
        </p>
      ) : null}
    </main>
  );
}
