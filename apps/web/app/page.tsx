"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { Search, Loader2 } from "lucide-react";
import { TokenCard } from "../components/TokenCard";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

type StatusResponse = {
  ok: boolean;
  providers: Record<string, boolean>;
  error?: string;
};

type ScanResponse = {
  ok: boolean;
  error?: string;
  scanRunId: string;
  sourceToken: { mint: string; symbol?: string; name?: string };
  results: Array<any>;
  summary: { scannedHolderCount: number; copyCAs: string };
  warnings: string[];
};

export default function HomePage() {
  const [mint, setMint] = useState("");
  const [scanResponse, setScanResponse] = useState<ScanResponse | null>(null);
  const [statusResponse, setStatusResponse] = useState<StatusResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/v1/system/status`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (!cancelled) setStatusResponse(payload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScanError(null);

    try {
      const response = await fetch(`${API_BASE}/v1/scans/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, topResults: 10 })
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Scan failed.");

      startTransition(() => {
        setScanResponse(payload);
        setScanError(null);
      });
    } catch (error) {
      setScanResponse(null);
      setScanError(error instanceof Error ? error.message : "Scan failed.");
    }
  }

  const allProvidersOk = statusResponse && Object.values(statusResponse.providers).every(v => v);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 pt-24 pb-32">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
      
      {/* Header & Status */}
      <header className="w-full max-w-4xl flex justify-between items-center mb-16">
        <div className="flex gap-2 items-center">
          <div className="h-6 w-6 rounded-md bg-emerald-500/20 flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          </div>
          <span className="font-display font-semibold tracking-wide text-lg">CABALFINDER</span>
        </div>
        
        {statusResponse && (
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-400 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <span className={`h-2 w-2 rounded-full ${allProvidersOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {allProvidersOk ? 'System Ready' : 'Degraded'}
          </div>
        )}
      </header>

      {/* Hero Command Center */}
      <div className="w-full max-w-2xl flex flex-col items-center mb-16">
        <h1 className="text-4xl md:text-5xl font-display font-bold text-center mb-6 tracking-tight">
          Discover Token <span className="text-emerald-400">Clusters</span>
        </h1>
        <p className="text-zinc-400 text-center mb-8 max-w-lg">
          Paste a Solana token mint. Helius DAS maps top holders and the Wallet API discovers strongly correlated co-held assets.
        </p>

        <form onSubmit={handleScanSubmit} className="w-full relative">
          <div className="relative group command-input rounded-2xl bg-zinc-900/80 transition-all flex items-center p-2">
            <Search className="ml-4 h-5 w-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
            <input
              type="text"
              name="mint"
              placeholder="Enter Solana Token Mint..."
              className="w-full bg-transparent border-0 text-white placeholder-zinc-500 focus:ring-0 px-4 py-3 outline-none"
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isPending || mint.trim().length === 0}
              className="mr-1 bg-white text-black hover:bg-emerald-400 shrink-0 h-10 px-6 rounded-xl font-semibold uppercase tracking-wider text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? "Scanning" : "Analyze"}
            </button>
          </div>
        </form>
        {scanError && <p className="mt-4 text-red-400 text-sm">{scanError}</p>}
      </div>

      {/* Results Section */}
      <div className="w-full max-w-5xl">
        {scanResponse?.warnings && scanResponse.warnings.length > 0 && (
          <div className="mb-8 space-y-2">
            {scanResponse.warnings.map(w => (
              <div key={w} className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm rounded-lg">
                {w}
              </div>
            ))}
          </div>
        )}

        {scanResponse && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scanResponse.results.map((r, i) => (
              <TokenCard
                key={r.mint}
                result={r}
                rank={i + 1}
                scanRunId={scanResponse.scanRunId}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
