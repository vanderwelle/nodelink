"use client";

import algosdk from "algosdk";
import { Eye, Link2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useWalletModal } from "@/components/Providers";
import { NetPill } from "@/components/hub/NetPill";
import { TELEMETRY } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { saveWatchAddress, type NodeContext } from "@/lib/node";

/**
 * Tells the hub which node account to monitor. Read-only: watching an address only queries
 * public chain data (from this browser, via Nodely) and is stored in localStorage.
 */
export function NodePicker({ node, compact = false }: { node: NodeContext; compact?: boolean }) {
  const { open } = useWalletModal();
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (node.nodeAddress) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <Eye className="h-3.5 w-3.5 text-accent" />
        Monitoring <span className="font-mono text-gray-200">{shortAddress(node.nodeAddress, 6)}</span>
        <span className="rounded-md bg-white/5 px-1.5 py-0.5">{node.source === "session" ? "from private link" : "watched"}</span>
        {node.source === "watch" && (
          <button className="inline-flex items-center gap-1 text-gray-500 hover:text-white" onClick={() => saveWatchAddress(null)}>
            <X className="h-3 w-3" /> stop
          </button>
        )}
        <NetPill kind="data" />
      </div>
    );
  }

  const submit = (addr: string): void => {
    const a = addr.trim();
    if (!algosdk.isValidAddress(a)) {
      setErr("Not a valid Algorand address");
      return;
    }
    setErr(null);
    saveWatchAddress(a);
  };

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">Which node should we monitor?</div>
        <NetPill kind="data" />
      </div>
      {!compact && (
        <p className="text-xs text-gray-400">
          Paste your node (participation) account address, or use your connected wallet. Read-only {TELEMETRY.label} data — the address is stored only in this browser.
        </p>
      )}
      <div className="flex gap-2">
        <input className="input font-mono" placeholder="Node account address" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Node account address" />
        <button className="btn-primary shrink-0" onClick={() => submit(value)}>
          <Eye className="h-4 w-4" /> Watch
        </button>
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {node.activeAddress ? (
          <button className="btn-ghost text-xs" onClick={() => node.activeAddress && submit(node.activeAddress)}>
            <Wallet className="h-3.5 w-3.5" /> Use connected wallet ({shortAddress(node.activeAddress, 4)})
          </button>
        ) : (
          <button className="btn-ghost text-xs" onClick={() => open()}>
            <Wallet className="h-3.5 w-3.5" /> Connect wallet
          </button>
        )}
        <Link href="/link" className="inline-flex items-center gap-1 px-2 py-2 text-xs text-gray-400 hover:text-white">
          <Link2 className="h-3.5 w-3.5" /> or restore a private link
        </Link>
      </div>
    </div>
  );
}
