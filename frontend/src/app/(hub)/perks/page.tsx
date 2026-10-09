// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { getTier } from "@nodelink/shared";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PerksBrowser } from "@/components/content/PerksBrowser";
import { SectionHeader } from "@/components/hub/HubTabs";
import { NetPill } from "@/components/hub/NetPill";
import { getSection } from "@/components/hub/sections";
import { RankBadge } from "@/components/RankBadge";
import { useNode } from "@/lib/node";

const S = getSection("perks");

export default function PerksPage() {
  const node = useNode(60_000);
  return (
    <div className="space-y-6">
      <SectionHeader title={S.title} sub="Partner perks that unlock by NodeLink tier." icon={S.icon} tone={S.tone} right={<NetPill kind="contract" />} />
      {node.tier ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <RankBadge tier={node.tier} />
          <span className="text-xs text-gray-400">{getTier(node.tier).name} perks unlocked</span>
        </div>
      ) : (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />
            <div>
              <div className="text-sm font-medium text-white">Perks unlock with a NodeLink badge</div>
              <p className="text-xs text-gray-400">A private badge on a daily wallet proves your tier — your node wallet never touches partner apps.</p>
            </div>
          </div>
          <Link href="/link" className="btn-ghost shrink-0 text-xs">
            Get a badge
          </Link>
        </div>
      )}
      <PerksBrowser tier={node.tier} />
    </div>
  );
}
