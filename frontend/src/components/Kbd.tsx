// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">{children}</kbd>;
}
