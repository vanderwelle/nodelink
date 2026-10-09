// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { SECTIONS } from "./sections";

/** Tab strip shown above every hub section; fits 5 tabs + hub link on a 390px screen. */
export function HubTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6">
    <Link href="/" className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white">
      <LayoutGrid className="h-3.5 w-3.5" /> Hub
    </Link>
    <nav aria-label="Hub sections" className="card grid grid-cols-5 gap-1 p-1">
      {SECTIONS.map(({ id, href, short, icon: Icon, tone }) => {
        const active = pathname === href;
        return (
          <Link
            key={id}
            href={href}
            role="tab"
            aria-selected={active}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[11px] transition ${active ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className={`h-4 w-4 ${active ? tone : ""}`} />
            <span className="w-full truncate text-center">{short}</span>
          </Link>
        );
      })}
    </nav>
    </div>
  );
}

export function SectionHeader({ title, sub, icon: Icon, tone, right }: { title: string; sub: string; icon: ComponentType<{ className?: string }>; tone: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Icon className={`h-6 w-6 shrink-0 ${tone}`} /> {title}
        </h1>
        <p className="mt-1 text-sm text-gray-400">{sub}</p>
      </div>
      {right}
    </div>
  );
}

/** Small pill marking data that is not live yet. */
export function Placeholder({ label = "Coming soon" }: { label?: string }) {
  return <span className="rounded-md border border-dashed border-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gray-400">{label}</span>;
}

export function LiveTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> live
    </span>
  );
}
