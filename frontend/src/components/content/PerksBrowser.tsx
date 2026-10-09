// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { getTier, type TierId } from "@nodelink/shared";
import { CalendarDays, ExternalLink, Gift, KeyRound, Link2, Lock, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { PERKS } from "@/content/perks";
import { effectiveStatus, formatDate, PERK_CATEGORIES, PERK_CATEGORY_LABEL, type ContentStatus, type Perk, type PerkCategory } from "@/content/schema";
import { EmptyState, ExamplePill, Logo, readQueryParam, Segmented, SortSelect, StatusPill, TierLock, writeQueryParam, type Option } from "./ui";

type StatusFilter = "all" | ContentStatus;
type CategoryFilter = "all" | PerkCategory;
type Sort = "featured" | "newest" | "ending" | "tier" | "partner";

const SORTS: readonly Option<Sort>[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
  { value: "tier", label: "Tier (low → high)" },
  { value: "partner", label: "Partner A–Z" },
];

const STATUS_ORDER: Record<ContentStatus, number> = { live: 0, upcoming: 1, ended: 2 };
const time = (d?: string): number => (d ? Date.parse(d) : NaN);

function sortPerks(list: Perk[], sort: Sort, status: (p: Perk) => ContentStatus): Perk[] {
  const byNum = (f: (p: Perk) => number, dir: 1 | -1) => (a: Perk, b: Perk) => {
    const x = f(a), y = f(b);
    if (Number.isNaN(x) && Number.isNaN(y)) return 0;
    if (Number.isNaN(x)) return 1;
    if (Number.isNaN(y)) return -1;
    return (x - y) * dir;
  };
  switch (sort) {
    case "featured": return list.sort((a, b) => STATUS_ORDER[status(a)] - STATUS_ORDER[status(b)] || a.minTier - b.minTier);
    case "newest": return list.sort(byNum((p) => time(p.start), -1));
    case "ending": return list.sort(byNum((p) => time(p.end), 1));
    case "tier": return list.sort((a, b) => a.minTier - b.minTier);
    case "partner": return list.sort((a, b) => a.partner.localeCompare(b.partner));
  }
}

export function PerksBrowser({ tier }: { tier: TierId | null }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<Sort>("featured");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => setOpenId(readQueryParam("perk")), []);
  const open = (id: string | null): void => {
    setOpenId(id);
    writeQueryParam("perk", id);
  };

  const statusOf = (p: Perk): ContentStatus => effectiveStatus(p, now);
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: PERKS.length, live: 0, upcoming: 0, ended: 0 };
    for (const p of PERKS) c[effectiveStatus(p, now)] += 1;
    return c;
  }, [now]);
  const presentCategories = PERK_CATEGORIES.filter((c) => PERKS.some((p) => p.category === c));

  const perks = useMemo(
    () =>
      sortPerks(
        PERKS.filter(
          (p) =>
            (status === "all" || effectiveStatus(p, now) === status) &&
            (category === "all" || p.category === category) &&
            (!eligibleOnly || (tier !== null && tier >= p.minTier)),
        ),
        sort,
        (p) => effectiveStatus(p, now),
      ),
    [status, category, eligibleOnly, sort, tier, now],
  );
  const selected = openId ? PERKS.find((p) => p.id === openId) ?? null : null;

  if (PERKS.length === 0) {
    return (
      <EmptyState icon={Gift} title="No perks yet">
        Partners are coming soon. When they launch, perks appear here and unlock automatically by your NodeLink tier — claimed from a
        badge wallet, so your node wallet never touches partner apps.
      </EmptyState>
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <Segmented
          label="Perk status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "live", label: "Live", count: counts.live },
            { value: "upcoming", label: "Upcoming", count: counts.upcoming },
            { value: "ended", label: "Ended", count: counts.ended },
          ]}
        />
        {presentCategories.length > 1 && (
          <Segmented
            label="Category"
            value={category}
            onChange={setCategory}
            options={[{ value: "all", label: "All categories" }, ...presentCategories.map((c) => ({ value: c, label: PERK_CATEGORY_LABEL[c] }))]}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} /> Unlocked for my tier
          </label>
          <SortSelect value={sort} onChange={setSort} options={SORTS} />
        </div>
      </div>

      {perks.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No perks match these filters"
          action={
            <button className="btn-ghost text-xs" onClick={() => { setStatus("all"); setCategory("all"); setEligibleOnly(false); }}>
              Reset filters
            </button>
          }
        >
          Try another status or category.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perks.map((p) => (
            <PerkCard key={p.id} perk={p} tier={tier} status={statusOf(p)} onOpen={() => open(p.id)} />
          ))}
        </div>
      )}

      {selected && <PerkDetail perk={selected} tier={tier} status={statusOf(selected)} onClose={() => open(null)} />}
    </section>
  );
}

function PerkCard({ perk, tier, status, onOpen }: { perk: Perk; tier: TierId | null; status: ContentStatus; onOpen: () => void }) {
  const unlocked = tier !== null && tier >= perk.minTier;
  const dates = [formatDate(perk.start), formatDate(perk.end)];
  return (
    <button onClick={onOpen} className={`card flex flex-col p-4 text-left transition hover:border-white/25 ${status === "ended" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <Logo src={perk.logo} name={perk.partner} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-gray-500">{perk.partner}</div>
          <div className="font-semibold leading-snug text-white">{perk.title}</div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 flex-1 text-sm text-gray-400">{perk.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill status={status} />
        {perk.example && <ExamplePill />}
        <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gray-300">{PERK_CATEGORY_LABEL[perk.category]}</span>
        <span className="ml-auto">
          <TierLock minTier={perk.minTier} tier={tier} />
        </span>
      </div>
      {(dates[0] || dates[1]) && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
          <CalendarDays className="h-3 w-3" /> {dates[0] ?? "now"} → {dates[1] ?? "open-ended"}
        </div>
      )}
      {!unlocked && <span className="sr-only">Locked</span>}
    </button>
  );
}

function ClaimAction({ perk, unlocked, status }: { perk: Perk; unlocked: boolean; status: ContentStatus }) {
  const req = getTier(perk.minTier);
  if (status === "ended") return <button className="btn-ghost w-full" disabled>Ended</button>;
  if (!unlocked) {
    return (
      <Link href="/link" className="btn-ghost w-full">
        <Lock className="h-4 w-4" /> Requires {req.name} badge — get one
      </Link>
    );
  }
  if (status === "upcoming") return <button className="btn-ghost w-full" disabled>Opens {formatDate(perk.start) ?? "soon"}</button>;
  const c = perk.claim;
  const label = c.label ?? (c.type === "link" ? "Open perk" : c.type === "onchain" ? "Claim on-chain" : "Get code");
  const Icon = c.type === "link" ? Link2 : c.type === "onchain" ? KeyRound : Ticket;
  const href = c.url;
  return href ? (
    <a className="btn-primary w-full" href={href} target="_blank" rel="noreferrer">
      <Icon className="h-4 w-4" /> {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  ) : (
    <button className="btn-primary w-full" disabled>
      <Icon className="h-4 w-4" /> {label} (coming soon)
    </button>
  );
}

function PerkDetail({ perk, tier, status, onClose }: { perk: Perk; tier: TierId | null; status: ContentStatus; onClose: () => void }) {
  const unlocked = tier !== null && tier >= perk.minTier;
  const claimText =
    perk.claim.type === "link"
      ? "Opens the partner's page. Connect your NodeLink badge wallet there — not your node wallet."
      : perk.claim.type === "onchain"
        ? `Claimed by an on-chain call (${perk.claim.network} app ${perk.claim.appId}) that checks your wallet's NodeLink badge.`
        : perk.claim.instructions;
  return (
    <Modal
      onClose={onClose}
      title={
        <div className="flex items-start gap-3">
          <Logo src={perk.logo} name={perk.partner} size={48} />
          <div className="min-w-0">
            <div className="text-xs text-gray-500">{perk.partner}</div>
            <h2 className="text-lg font-semibold leading-snug text-white">{perk.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill status={status} />
              {perk.example && <ExamplePill />}
              <TierLock minTier={perk.minTier} tier={tier} />
            </div>
          </div>
        </div>
      }
      footer={<ClaimAction perk={perk} unlocked={unlocked} status={status} />}
    >
      <div className="space-y-4 text-sm text-gray-300">
        {(perk.description ?? perk.summary).split(/\n\s*\n/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-white/5 p-3 text-xs">
          <div><dt className="text-gray-500">Category</dt><dd className="text-gray-200">{PERK_CATEGORY_LABEL[perk.category]}</dd></div>
          <div><dt className="text-gray-500">Minimum tier</dt><dd style={{ color: getTier(perk.minTier).color }}>{getTier(perk.minTier).name}</dd></div>
          <div><dt className="text-gray-500">Starts</dt><dd className="text-gray-200">{formatDate(perk.start) ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Ends</dt><dd className="text-gray-200">{formatDate(perk.end) ?? "—"}</dd></div>
        </dl>
        <p className="text-xs text-gray-400">{claimText}</p>
        {perk.url && (
          <a className="inline-flex items-center gap-1 text-xs text-accent" href={perk.url} target="_blank" rel="noreferrer">
            About {perk.partner} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </Modal>
  );
}
