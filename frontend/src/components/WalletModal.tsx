// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { useWallet } from "@txnlab/use-wallet-react";
import { Check, LogOut, Wallet as WalletIcon, X } from "lucide-react";
import { useState } from "react";
import { shortAddress, errorMessage } from "@/lib/format";

export function WalletModal({ purpose, onClose }: { purpose: string; onClose: () => void }) {
  const { wallets, activeAddress } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <WalletIcon className="h-5 w-5 text-accent" /> {purpose}
          </h2>
          <button className="text-gray-400 hover:text-white" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-gray-400">
          NodeLink only ever requests signatures for NodeLink transactions on TestNet. It never asks for rekeying or
          delegated signing — your hot wallet gets <strong>zero</strong> authority over your cold wallet.
        </p>
        <ul className="space-y-2">
          {wallets.map((w) => (
            <li key={w.walletKey} className="rounded-xl border border-white/10 bg-ink-800/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.metadata.icon} alt="" className="h-8 w-8 rounded-lg" />
                  <div>
                    <div className="text-sm font-medium">{w.metadata.name}</div>
                    {w.isConnected && w.activeAccount && (
                      <div className="font-mono text-xs text-gray-400">{shortAddress(w.activeAccount.address)}</div>
                    )}
                  </div>
                </div>
                {w.isConnected ? (
                  <div className="flex items-center gap-2">
                    {w.isActive ? (
                      <span className="flex items-center gap-1 text-xs text-accent">
                        <Check className="h-3 w-3" /> active
                      </span>
                    ) : (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => w.setActive()}>
                        Use
                      </button>
                    )}
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void w.disconnect()} aria-label="Disconnect">
                      <LogOut className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-primary px-3 py-1 text-xs"
                    disabled={busy !== null}
                    onClick={async () => {
                      setError(null);
                      setBusy(w.walletKey);
                      try {
                        await w.connect();
                        w.setActive();
                      } catch (err) {
                        setError(errorMessage(err));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === w.walletKey ? "Connecting…" : "Connect"}
                  </button>
                )}
              </div>
              {w.isConnected && w.accounts.length > 1 && (
                <select
                  className="input mt-2 py-1 text-xs"
                  value={w.activeAccount?.address ?? ""}
                  onChange={(e) => w.setActiveAccount(e.target.value)}
                >
                  {w.accounts.map((a) => (
                    <option key={a.address} value={a.address}>
                      {a.name} — {shortAddress(a.address, 6)}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        {activeAddress && (
          <p className="mt-4 text-xs text-gray-500">
            Active account: <span className="font-mono">{shortAddress(activeAddress, 8)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
