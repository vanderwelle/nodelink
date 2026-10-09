// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { useWallet } from "@txnlab/use-wallet-react";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";
import { useWalletModal } from "./Providers";

export function ConnectButton({ label = "Connect Wallet", className = "btn-primary" }: { label?: string; className?: string }) {
  const { activeAddress } = useWallet();
  const { open } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button className={className} onClick={() => open()}>
      <Wallet className="h-4 w-4" />
      {mounted && activeAddress ? shortAddress(activeAddress) : label}
    </button>
  );
}
