"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AddressCopier } from "./AddressCopier";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

interface TokenResult {
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
}

export function TokenCard({ result, scanRunId, rank }: { result: TokenResult; scanRunId: string; rank: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState<Array<{ address: string; usdValue: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleOverlap() {
    if (!open && !wallets) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/v1/scans/active/${scanRunId}/overlap/${result.mint}`);
        const payload = await res.json();
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error || "Failed to load wallets");
        }
        setWallets(payload.wallets);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading wallets");
      } finally {
        setLoading(false);
      }
    }

    setOpen((prev) => !prev);
  }

  const formatUsd = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value >= 1_000_000 ? 0 : 2
    }).format(value);

  const controlPct = Math.max(0, Math.min(100, result.controlPct * 100));

  return (
    <article className="result-card glass-panel flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Rank #{rank}</p>
          <h3 className="mt-1 text-base font-semibold text-white">{result.symbol || "Unnamed token"}</h3>
          <p className="text-xs text-zinc-500">{result.name || result.mint}</p>
        </div>
        <AddressCopier address={result.ca} />
      </header>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Market cap</p>
          <p className="mt-1 font-mono text-zinc-200">{formatUsd(result.marketCapUsd)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Group value</p>
          <p className="mt-1 font-mono text-emerald-300">{formatUsd(result.totalUsdHeld)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Control</p>
          <p className="mt-1 font-mono text-zinc-200">{controlPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Score</p>
          <p className="mt-1 font-mono text-zinc-200">{result.score.toFixed(3)}</p>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span>Holder control bar</span>
          <span>{controlPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${controlPct}%` }} />
        </div>
      </div>

      <div className="border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={toggleOverlap}
          className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs uppercase tracking-[0.15em] text-zinc-400 hover:text-zinc-200"
        >
          <span>Shared wallets ({result.overlapHolderCount})</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {open && (
          <div className="mt-2 space-y-2">
            {loading ? <p className="text-xs text-zinc-500">Loading wallets…</p> : null}
            {error ? <p className="text-xs text-red-300">{error}</p> : null}
            {wallets?.length ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {wallets.map((wallet) => (
                  <li key={wallet.address} className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5">
                    <AddressCopier
                      address={wallet.address}
                      showFullOnHover
                      className="border-transparent bg-transparent px-0 text-[11px]"
                    />
                    <span className="font-mono text-xs text-zinc-400">{formatUsd(wallet.usdValue)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {wallets && wallets.length === 0 ? <p className="text-xs text-zinc-500">No overlap wallets found.</p> : null}
          </div>
        )}
      </div>
    </article>
  );
}
