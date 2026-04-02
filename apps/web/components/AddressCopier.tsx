"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";

interface AddressCopierProps {
  address: string;
  className?: string;
  showFullOnHover?: boolean;
}

export function AddressCopier({ address, className, showFullOnHover = false }: AddressCopierProps) {
  const [copied, setCopied] = useState(false);

  const shortAddress = address.length > 12 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignored
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-zinc-300 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white",
        className
      )}
      title="Copy address"
      aria-label="Copy address"
    >
      <span className="truncate">
        {showFullOnHover ? (
          <>
            <span className="block group-hover:hidden">{shortAddress}</span>
            <span className="hidden group-hover:block">{address}</span>
          </>
        ) : (
          shortAddress
        )}
      </span>
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
    </button>
  );
}
