"use client";

import { getTier, isTierId, type TierId } from "@nodelink/shared";
import { Filter, Lock, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { PERKS, type PerkCategory } from "@/data/perks";

const CATEGORIES: readonly ("All" | PerkCategory)[] = ["All", "DeFi", "Airdrop", "Governance", "Tools"];

export function Launchpad({ tier }: { tier: TierId | null }) {
  const [category, setCategory] = useState<"All" | PerkCategory>("All");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const perks = useMemo(
    () =>
      PERKS.filter((p) => (category === "All" || p.category === category) && (!eligibleOnly || (tier !== null && tier >= p.minTier))),
    [category, eligibleOnly, tier],
  );
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Ecosystem Launchpad</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1 text-xs ${category === c ? "bg-accent text-ink-950" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
            >
              {c}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} /> eligible only
          </label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {perks.map((p) => {
          const unlocked = tier !== null && tier >= p.minTier;
          const req = isTierId(p.minTier) ? getTier(p.minTier) : null;
          return (
            <div key={p.id} className={`card flex flex-col p-5 ${unlocked ? "" : "opacity-60"}`}>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-gray-300">{p.category}</span>
                <span className="flex items-center gap-1" style={{ color: req?.color }}>
                  {unlocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {req?.name}+
                </span>
              </div>
              <h3 className="font-semibold text-white">{p.title}</h3>
              <div className="text-xs text-gray-500">{p.partner}</div>
              <p className="mt-2 flex-1 text-sm text-gray-400">{p.description}</p>
              <button className="btn-ghost mt-4" disabled={!unlocked}>
                {unlocked ? p.cta : `Requires ${req?.name ?? "higher tier"}`}
              </button>
            </div>
          );
        })}
        {perks.length === 0 && <p className="text-sm text-gray-500">No perks match this filter.</p>}
      </div>
    </section>
  );
}
