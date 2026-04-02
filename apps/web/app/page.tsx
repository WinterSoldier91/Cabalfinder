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
  holderOverlapPct?: number;
  valueSharePct?: number;
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

type SourceHoldersResponse = {
  ok: boolean;
  error?: string;
  holders: Array<{ address: string; rank: number; share: number }>;
};

type OverlapResponse = {
  ok: boolean;
  error?: string;
  wallets: Array<{ address: string }>;
};

type BatchCommonResponse = {
  ok: boolean;
  error?: string;
  scanRunId: string;
  tokens: Array<{ mint: string; symbol?: string; name?: string; scannedHolders: number; deployerCandidateCount: number }>;
  summary: {
    requestedMintCount: number;
    topHolderLimit: number;
    commonWalletCount: number;
    devLinkedWalletCount: number;
  };
  wallets: Array<{
    address: string;
    devLinkedTokenCount: number;
    avgShare: number;
    tokenMatches: Array<{
      mint: string;
      symbol?: string;
      name?: string;
      holderRank: number | null;
      share: number | null;
      directFromDeployer: boolean;
    }>;
  }>;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export default function HomePage() {
  const [mint, setMint] = useState("");
  const [scanResponse, setScanResponse] = useState<ScanResponse | null>(null);
  const [statusResponse, setStatusResponse] = useState<StatusResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [customHeliusApiKey, setCustomHeliusApiKey] = useState("");
  const [rememberCustomHeliusApiKey, setRememberCustomHeliusApiKey] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRelated, setCopiedRelated] = useState(false);
  const [copiedRelatedCa, setCopiedRelatedCa] = useState<string | null>(null);
  const [batchMintsInput, setBatchMintsInput] = useState("");
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResponse, setBatchResponse] = useState<BatchCommonResponse | null>(null);
  const [crossScanInsight, setCrossScanInsight] = useState<{
    previousBaseMint: string;
    newBaseMint: string;
    previousOverlapCount: number;
    persistedCount: number;
    persistedPct: number;
  } | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedKey = window.localStorage.getItem("cabalfinder.customHeliusApiKey");
    if (savedKey) {
      setCustomHeliusApiKey(savedKey);
      setRememberCustomHeliusApiKey(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!rememberCustomHeliusApiKey) {
      window.localStorage.removeItem("cabalfinder.customHeliusApiKey");
      return;
    }

    const trimmed = customHeliusApiKey.trim();
    if (trimmed) {
      window.localStorage.setItem("cabalfinder.customHeliusApiKey", trimmed);
    } else {
      window.localStorage.removeItem("cabalfinder.customHeliusApiKey");
    }
  }, [customHeliusApiKey, rememberCustomHeliusApiKey]);

  const providerChecks = useMemo(() => {
    if (!statusResponse?.providers) {
      return [] as Array<{ name: string; ok: boolean }>;
    }

    return Object.entries(statusResponse.providers).map(([name, ok]) => ({ name, ok }));
  }, [statusResponse]);

  const allProvidersOk = providerChecks.length > 0 && providerChecks.every((item) => item.ok);

  const getRelatedPct = (result: ScanResult): number => {
    if (typeof result.holderOverlapPct === "number") {
      return Math.max(0, result.holderOverlapPct);
    }

    const scannedHolderCount = scanResponse?.summary.scannedHolderCount ?? 0;
    if (scannedHolderCount > 0) {
      return Math.max(0, result.overlapHolderCount / scannedHolderCount);
    }

    return Math.max(0, result.controlPct);
  };

  const relatedSortedResults = useMemo(() => {
    if (!scanResponse) {
      return [] as ScanResult[];
    }

    return [...scanResponse.results].sort((a, b) => getRelatedPct(b) - getRelatedPct(a));
  }, [scanResponse]);

  const relatedStatsText = useMemo(() => {
    if (!scanResponse) {
      return "";
    }

    const sourceName =
      scanResponse.sourceToken.name?.trim() ||
      scanResponse.sourceToken.symbol?.trim() ||
      scanResponse.sourceToken.mint;
    const sourceSymbol = scanResponse.sourceToken.symbol?.trim();
    const sourceTitle = sourceSymbol ? `${sourceName} ($${sourceSymbol})` : sourceName;

    const relatedLines = relatedSortedResults.map((result) => {
      const relatedName = result.name?.trim() || result.symbol?.trim() || result.mint;
      return `${(getRelatedPct(result) * 100).toFixed(2)}% related to ${relatedName}`;
    });

    return [sourceTitle, scanResponse.sourceToken.mint, "♥Related：", ...relatedLines].join("\n\n");
  }, [relatedSortedResults, scanResponse]);

  async function runScanWithMint(trimmedMint: string): Promise<ScanResponse> {
    const trimmedCustomKey = customHeliusApiKey.trim();
    const requestPayload: {
      mint: string;
      topResults: number;
      heliusApiKey?: string;
    } = {
      mint: trimmedMint,
      topResults: 10
    };

    if (trimmedCustomKey) {
      requestPayload.heliusApiKey = trimmedCustomKey;
    }

    const response = await fetch(`${API_BASE}/v1/scans/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload)
    });

    const payload = (await response.json()) as ScanResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Scan failed.");
    }

    return payload;
  }

  async function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMint = mint.trim();
    if (!trimmedMint) {
      return;
    }

    setIsScanning(true);
    setScanError(null);
    setScanResponse(null);
    setCrossScanInsight(null);
    setCopiedAll(false);
    setCopiedRelated(false);
    setCopiedRelatedCa(null);

    try {
      const payload = await runScanWithMint(trimmedMint);
      setScanResponse(payload);
    } catch (error) {
      setScanResponse(null);
      setScanError(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setIsScanning(false);
    }
  }

  async function runBidirectionalCrossScan(targetMint: string) {
    if (!scanResponse) {
      return;
    }

    const previousBaseMint = scanResponse.sourceToken.mint;
    const previousRunId = scanResponse.scanRunId;

    setIsScanning(true);
    setScanError(null);
    setCrossScanInsight(null);

    try {
      const overlapRes = await fetch(`${API_BASE}/v1/scans/active/${previousRunId}/overlap/${targetMint}`);
      const overlapPayload = (await overlapRes.json()) as OverlapResponse;
      if (!overlapRes.ok || !overlapPayload.ok) {
        throw new Error(overlapPayload.error ?? "Failed to load overlap wallets for cross-scan.");
      }

      const previousOverlapSet = new Set(overlapPayload.wallets.map((wallet) => wallet.address));

      setMint(targetMint);
      const newScan = await runScanWithMint(targetMint);
      setScanResponse(newScan);

      const holdersRes = await fetch(`${API_BASE}/v1/scans/active/${newScan.scanRunId}/holders`);
      const holdersPayload = (await holdersRes.json()) as SourceHoldersResponse;
      if (!holdersRes.ok || !holdersPayload.ok) {
        throw new Error(holdersPayload.error ?? "Failed to load source holders for cross-scan.");
      }

      const newSourceSet = new Set(holdersPayload.holders.map((holder) => holder.address));
      const persistedCount = [...previousOverlapSet].filter((address) => newSourceSet.has(address)).length;
      const persistedPct = previousOverlapSet.size > 0 ? persistedCount / previousOverlapSet.size : 0;

      setCrossScanInsight({
        previousBaseMint,
        newBaseMint: targetMint,
        previousOverlapCount: previousOverlapSet.size,
        persistedCount,
        persistedPct
      });
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Cross-scan failed.");
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

  async function copyRelatedStats() {
    if (!relatedStatsText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(relatedStatsText);
      setCopiedRelated(true);
      setTimeout(() => setCopiedRelated(false), 1500);
    } catch {
      // ignored
    }
  }

  async function runBatchCommonScan() {
    const parsedMints = batchMintsInput
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (parsedMints.length < 3) {
      setBatchError("Add at least 3 mints for batch common-thread scan.");
      return;
    }

    setIsBatchScanning(true);
    setBatchError(null);
    setBatchResponse(null);

    try {
      const response = await fetch(`${API_BASE}/v1/scans/active/batch-common`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mints: parsedMints.slice(0, 5), topHolderLimit: 50 })
      });

      const payload = (await response.json()) as BatchCommonResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Batch scan failed.");
      }

      setBatchResponse(payload);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "Batch scan failed.");
    } finally {
      setIsBatchScanning(false);
    }
  }

  async function copyRelatedTokenAddress(address: string) {
    if (!address) {
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setCopiedRelatedCa(address);
      setTimeout(() => setCopiedRelatedCa((current) => (current === address ? null : current)), 1500);
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

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <label htmlFor="custom-helius-key" className="block text-xs uppercase tracking-[0.12em] text-zinc-500">
              Optional user Helius/RPC key
            </label>
            <p className="mt-1 text-xs text-zinc-500">Used only for your scan request; not persisted in backend storage.</p>
            <input
              id="custom-helius-key"
              type="password"
              className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 text-sm text-white outline-none placeholder:text-zinc-500"
              placeholder="Paste your own key for this browser/user"
              value={customHeliusApiKey}
              onChange={(event) => setCustomHeliusApiKey(event.target.value)}
              autoComplete="off"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={rememberCustomHeliusApiKey}
                  onChange={(event) => setRememberCustomHeliusApiKey(event.target.checked)}
                />
                Remember this key in this browser only
              </label>
              <button
                type="button"
                onClick={() => {
                  setCustomHeliusApiKey("");
                  setRememberCustomHeliusApiKey(false);
                }}
                className="text-xs text-zinc-500 transition hover:text-zinc-300"
              >
                Clear key
              </button>
            </div>
          </div>
        </form>
        {scanError && (
          <p className="error-banner mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {scanError}
          </p>
        )}
      </section>

      <section className="glass-panel mb-6 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Batch multi-token scan</p>
            <p className="mt-1 text-sm text-zinc-400">Paste 3–5 mints to find wallets common across all tokens.</p>
          </div>
          <button
            type="button"
            onClick={runBatchCommonScan}
            disabled={isBatchScanning}
            className="h-10 rounded-lg border border-emerald-500/40 px-4 text-sm text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBatchScanning ? "Scanning…" : "Run batch scan"}
          </button>
        </div>
        <textarea
          value={batchMintsInput}
          onChange={(event) => setBatchMintsInput(event.target.value)}
          placeholder="mint_1\nmint_2\nmint_3"
          className="mt-3 min-h-24 w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        {batchError ? <p className="mt-2 text-sm text-red-300">{batchError}</p> : null}
      </section>

      {batchResponse ? (
        <section className="glass-panel mb-6 p-4 md:p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Common-thread wallets</p>
          <p className="mt-1 text-sm text-zinc-300">
            {batchResponse.summary.commonWalletCount} wallets shared across {batchResponse.summary.requestedMintCount} mints •{" "}
            {batchResponse.summary.devLinkedWalletCount} wallet(s) show direct deployer transfer links.
          </p>
          <div className="mt-3 space-y-2">
            {batchResponse.wallets.slice(0, 20).map((wallet) => (
              <div key={wallet.address} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-zinc-200">{wallet.address}</p>
                  <span className="text-xs text-zinc-400">dev links: {wallet.devLinkedTokenCount}</span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-zinc-400">
                  {wallet.tokenMatches.map((match) => (
                    <p key={`${wallet.address}-${match.mint}`}>
                      {match.symbol || match.name || match.mint}: rank {match.holderRank ?? "-"} • share{" "}
                      {match.share !== null ? `${(match.share * 100).toFixed(2)}%` : "-"} • {match.directFromDeployer ? "dev-linked" : "no dev link"}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyAllAddresses}
                className="h-10 rounded-lg border border-white/15 px-4 text-sm text-zinc-200 transition hover:border-white/30 hover:bg-white/10"
              >
                {copiedAll ? "Copied" : "Copy all CAs"}
              </button>
              <button
                type="button"
                onClick={copyRelatedStats}
                className="h-10 rounded-lg border border-white/15 px-4 text-sm text-zinc-200 transition hover:border-white/30 hover:bg-white/10"
              >
                {copiedRelated ? "Copied" : "Copy related stats"}
              </button>
            </div>
          </div>
        </section>
      )}

      {crossScanInsight ? (
        <section className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <p className="font-medium">Bi-directional cross-scan result</p>
          <p className="mt-1">
            From <span className="font-mono">{crossScanInsight.previousBaseMint}</span> →{" "}
            <span className="font-mono">{crossScanInsight.newBaseMint}</span>, {crossScanInsight.persistedCount} of{" "}
            {crossScanInsight.previousOverlapCount} prior overlap wallets persisted ({(crossScanInsight.persistedPct * 100).toFixed(2)}%).
          </p>
        </section>
      ) : null}

      {scanResponse?.warnings?.length ? (
        <section className="mb-6 space-y-2">
          {scanResponse.warnings.map((warning) => (
            <p key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {warning}
            </p>
          ))}
        </section>
      ) : null}

      {scanResponse && scanResponse.results.length > 0 ? (
        <section className="glass-panel mb-6 p-4 md:p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Related stats</p>
          <p className="mt-2 text-sm text-zinc-300">
            {(scanResponse.sourceToken.name || scanResponse.sourceToken.symbol || scanResponse.sourceToken.mint)}
            {scanResponse.sourceToken.symbol ? ` ($${scanResponse.sourceToken.symbol})` : ""}
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-500">{scanResponse.sourceToken.mint}</p>

          <ul className="mt-3 space-y-1.5 text-sm text-zinc-200">
            {relatedSortedResults.map((result) => {
              const tokenLabel = result.name || result.symbol || result.mint;
              const address = result.ca || result.mint;
              return (
                <li key={`related-${result.mint}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-emerald-300">{(getRelatedPct(result) * 100).toFixed(2)}%</span>
                  <span>related to</span>
                  <span className="text-zinc-100">{tokenLabel}</span>
                  <button
                    type="button"
                    onClick={() => runBidirectionalCrossScan(result.mint)}
                    className="rounded-md border border-emerald-500/30 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-emerald-300 transition hover:border-emerald-400 hover:text-emerald-200"
                  >
                    Run as base
                  </button>
                  <button
                    type="button"
                    onClick={() => copyRelatedTokenAddress(address)}
                    className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
                  >
                    {copiedRelatedCa === address ? "Copied" : "Copy CA"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="results-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scanResponse?.results.map((result, index) => (
          <TokenCard
            key={result.mint}
            result={result}
            rank={index + 1}
            scanRunId={scanResponse.scanRunId}
            scannedHolderCount={scanResponse.summary.scannedHolderCount}
            onRunAsBase={runBidirectionalCrossScan}
          />
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
