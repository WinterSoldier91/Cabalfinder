"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertCircle, Coins, Users, Wallet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AddressCopier } from "./AddressCopier";
import { cn } from "../lib/utils";

// Make sure API_BASE matches what page.tsx uses (empty on Vercel for relative)
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
  const [wallets, setWallets] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleOverlap() {
    if (!open && !wallets) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/v1/scans/active/${scanRunId}/overlap/${result.mint}`);
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error(payload.error || "Failed to load wallets");
        setWallets(payload.wallets);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading wallets");
      } finally {
        setLoading(false);
      }
    }
    setOpen((prev) => !prev);
  }

  const formatUsd = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: val > 1_000_000 ? 0 : 2 }).format(val);
  
  const pctString = `${(result.controlPct * 100).toFixed(1)}%`;

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 text-sm hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4 items-center">
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-white/5 border border-white/10 font-mono text-xs text-emerald-400">
            #{rank}
          </div>
          <div>
            <h3 className="font-bold text-lg text-white leading-none mb-1.5 flex items-center gap-2">
              {result.symbol || "Unnamed"}
            </h3>
            <p className="text-zinc-400 text-xs">{result.name || "Unknown Token"}</p>
          </div>
        </div>
        <AddressCopier address={result.ca} />
      </div>

      <div className="grid grid-cols-2 gap-y-4 gap-x-6 mt-2">
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 mb-1.5">
            <Coins className="h-3 w-3" /> Market Cap
          </span>
          <span className="font-mono text-zinc-200">{formatUsd(result.marketCapUsd)}</span>
        </div>
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 mb-1.5">
            <Wallet className="h-3 w-3" /> Group Value
          </span>
          <span className="font-mono text-zinc-200 text-emerald-400">{formatUsd(result.totalUsdHeld)}</span>
        </div>
      </div>

      <div className="mt-2 text-xs">
        <div className="flex justify-between mb-1.5">
          <span className="text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3" /> Top Holder Control
          </span>
          <span className="font-mono text-emerald-400">{pctString}</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: Math.min(result.controlPct * 100, 100) + "%" }} />
        </div>
      </div>

      <div className="pt-4 border-t border-white/5 mt-2">
        <button
          onClick={toggleOverlap}
          className="w-full flex justify-between items-center text-xs uppercase tracking-widest font-semibold text-zinc-400 py-1 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Shared Wallets ({result.overlapHolderCount})
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 pb-1">
                {loading && <p className="text-zinc-500 animate-pulse text-center py-2">Loading wallets...</p>}
                {error && <p className="text-red-400 text-center py-2">{error}</p>}
                {wallets && wallets.length > 0 && (
                  <ul className="max-h-[200px] overflow-y-auto pr-1 space-y-1.5">
                    {wallets.map((w) => (
                      <li key={w.address} className="flex justify-between items-center py-1.5 px-2 rounded-md hover:bg-white/5">
                        <AddressCopier address={w.address} showFullOnHover className="bg-transparent border-transparent px-1 py-0.5 hover:bg-white/10" />
                        <span className="font-mono text-zinc-400">{formatUsd(w.usdValue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {wallets && wallets.length === 0 && (
                  <p className="text-zinc-500 text-center py-2">No matching deterministic wallets.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
