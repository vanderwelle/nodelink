"use client";

import { getTier } from "@nodelink/shared";
import Link from "next/link";
import { SectionHeader } from "@/components/hub/HubTabs";
import { getSection } from "@/components/hub/sections";
import { Launchpad } from "@/components/Launchpad";
import { RankBadge } from "@/components/RankBadge";
import { Notice } from "@/components/ui";
import { useNode } from "@/lib/node";

const S = getSection("perks");

export default function PerksPage() {
  const node = useNode(60_000);
  return (
    <div className="space-y-6">
      <SectionHeader title={S.title} sub="Perks unlock by NodeLink tier. Partner names are placeholders — no partnerships implied." icon={S.icon} tone={S.tone} />
      {node.tier ? (
        <div className="card flex items-center justify-between gap-3 p-4">
          <RankBadge tier={node.tier} />
          <span className="text-xs text-gray-400">{getTier(node.tier).name} perks unlocked</span>
        </div>
      ) : (
        <Notice title="Perks are locked">
          Perks are claimed from a wallet carrying a NodeLink badge, so your node wallet never has to touch partner apps.{" "}
          <Link href="/link" className="underline">Get a private badge</Link> (optional, takes ~2 minutes).
        </Notice>
      )}
      <Launchpad tier={node.tier} />
    </div>
  );
}
