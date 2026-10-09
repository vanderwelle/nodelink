// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { Link2, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NETWORK } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { SECTIONS } from "./hub/sections";

const NAV = [
  { href: "/", label: "Hub" },
  ...SECTIONS.map((s) => ({ href: s.href, label: s.short })),
] as const;

/** Secondary destinations (mobile menu footer). */
const MORE = [
  { href: "/start-node", label: "Start a node" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/link", label: "Private link" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Link2 className="h-4 w-4" />
          </span>
          NodeLink
          <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
            {NETWORK}
          </span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 text-sm transition ${pathname === n.href ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden lg:block">
          <ConnectButton />
        </div>
        <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-4 py-3 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`block py-2 text-sm ${pathname === n.href ? "text-white" : "text-gray-300"}`} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-wrap gap-x-4 border-t border-white/10 pt-2">
            {MORE.map((n) => (
              <Link key={n.href} href={n.href} className="py-2 text-xs text-gray-500" onClick={() => setOpen(false)}>
                {n.label}
              </Link>
            ))}
          </div>
          <div className="pt-2">
            <ConnectButton />
          </div>
        </div>
      )}
    </header>
  );
}
