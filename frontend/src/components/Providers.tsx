"use client";

import { WalletProvider } from "@txnlab/use-wallet-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { walletManager } from "@/lib/wallet";
import { WalletModal } from "./WalletModal";

interface WalletModalContextValue {
  open: (purpose?: string) => void;
  close: () => void;
}

const WalletModalContext = createContext<WalletModalContextValue>({ open: () => undefined, close: () => undefined });

export function useWalletModal(): WalletModalContextValue {
  return useContext(WalletModalContext);
}

export function Providers({ children }: { children: ReactNode }) {
  const [purpose, setPurpose] = useState<string | null>(null);
  const open = useCallback((p?: string) => setPurpose(p ?? "Connect a wallet"), []);
  const close = useCallback(() => setPurpose(null), []);
  return (
    <WalletProvider manager={walletManager}>
      <WalletModalContext.Provider value={{ open, close }}>
        {children}
        {purpose !== null && <WalletModal purpose={purpose} onClose={close} />}
      </WalletModalContext.Provider>
    </WalletProvider>
  );
}
