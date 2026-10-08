"use client";

import { useWallet } from "@txnlab/use-wallet-react";
import { Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ConnectButton } from "./ConnectButton";

/** Client-side route guard: renders children only once a wallet is connected. */
export function RequireWallet({ children, title }: { children: (address: string) => ReactNode; title: string }) {
  const { activeAddress, isReady } = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !isReady) return <div className="py-24 text-center text-sm text-gray-500">Loading wallet session…</div>;
  if (!activeAddress) {
    return (
      <div className="card mx-auto mt-16 max-w-md p-8 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-accent" />
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mb-5 mt-1 text-sm text-gray-400">Connect your hot wallet to open your private HUD.</p>
        <ConnectButton />
      </div>
    );
  }
  return <>{children(activeAddress)}</>;
}
