"use client";

import { getTier, type TierId } from "@nodelink/shared";
import { ArrowDownUp, Lock, Unlock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ContentStatus } from "@/content/schema";

export const STATUS_STYLE: Record<ContentStatus, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30" },
  upcoming: { label: "Upcoming", cls: "bg-sky-400/10 text-sky-300 border-sky-400/30" },
  ended: { label: "Ended", cls: "bg-white/5 text-gray-400 border-white/10" },
};

export function StatusPill({ status }: { status: ContentStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${s.cls}`}>{s.label}</span>;
}

export function ExamplePill() {
  return <span className="rounded-md border border-dashed border-amber-400/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Example</span>;
}

export function TierLock({ minTier, tier }: { minTier: TierId; tier: TierId | null }) {
  const info = getTier(minTier);
  const unlocked = tier !== null && tier >= minTier;
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: info.color }} title={unlocked ? "Unlocked by your badge" : `Requires ${info.name} or higher`}>
      {unlocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {info.name}+
    </span>
  );
}

/** Logo image or a monogram fallback. */
export function Logo({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-xl bg-white/5 object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl bg-white/5 text-sm font-semibold text-gray-300" style={{ width: size, height: size }} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-gray-400">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-1 max-w-sm text-sm text-gray-400">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
}

/** Segmented tabs that wrap instead of scrolling sideways. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly Option<T>[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-xs transition ${value === o.value ? "bg-accent text-ink-950" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
        >
          {o.label}
          {o.count !== undefined && <span className={`ml-1 ${value === o.value ? "text-ink-950/70" : "text-gray-500"}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SortSelect<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: readonly Option<T>[] }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <ArrowDownUp className="h-3.5 w-3.5" />
      <span className="sr-only">Sort</span>
      <select className="rounded-lg border border-white/10 bg-ink-800 px-2 py-1.5 text-xs text-gray-200 focus:border-accent focus:outline-none" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Keeps `?<key>=<id>` in the URL for shareable detail views without a Suspense boundary. */
export function readQueryParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

export function writeQueryParam(key: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", url);
}
