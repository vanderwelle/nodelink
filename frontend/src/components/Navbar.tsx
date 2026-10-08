"use client";

import { Link2, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NETWORK } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";

const NAV = [
  { href: "/dashboard", label: "HUD" },
  { href: "/link", label: "Link Wizard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/start-node", label: "Start a Node" },
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
        <nav className="hidden items-center gap-1 md:flex">
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
        <div className="hidden md:block">
          <ConnectButton />
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-4 py-3 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block py-2 text-sm text-gray-300" onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          <div className="pt-2">
            <ConnectButton />
          </div>
        </div>
      )}
    </header>
  );
}
