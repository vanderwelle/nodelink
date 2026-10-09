// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { formatMultiplier, getTier, type TierId } from "@nodelink/shared";
import { Crown, Gem, Mountain, Shield, Telescope, type LucideIcon } from "lucide-react";

const ICONS: Record<TierId, LucideIcon> = { 1: Telescope, 2: Shield, 3: Mountain, 4: Crown, 5: Gem };

export function RankBadge({ tier, size = "md" }: { tier: TierId; size?: "sm" | "md" | "lg" }) {
  const info = getTier(tier);
  const Icon = ICONS[tier];
  const dims = size === "lg" ? "h-20 w-20" : size === "sm" ? "h-8 w-8" : "h-12 w-12";
  const iconDims = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex ${dims} items-center justify-center rounded-2xl border`}
        style={{ borderColor: `${info.color}66`, background: `${info.color}1a`, color: info.color }}
      >
        <Icon className={iconDims} />
      </div>
      {size !== "sm" && (
        <div>
          <div className="text-lg font-semibold" style={{ color: info.color }}>
            {info.name}
          </div>
          <div className="text-xs text-gray-400">Tier {tier} · {formatMultiplier(info.multiplierBps)} reward multiplier</div>
        </div>
      )}
    </div>
  );
}
