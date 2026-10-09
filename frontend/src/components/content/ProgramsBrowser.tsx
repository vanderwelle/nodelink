// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { getTier, TIERS, type TierId } from "@nodelink/shared";
import { CalendarDays, ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { REWARDS_PROGRAMS } from "@/content/rewards-programs";
import { effectiveStatus, formatDate, PROGRAM_TYPE_LABEL, PROGRAM_TYPES, type ContentStatus, type ProgramType, type RewardsProgram } from "@/content/schema";
import { EmptyState, ExamplePill, Logo, readQueryParam, Segmented, SortSelect, StatusPill, writeQueryParam, type Option } from "./ui";

type TypeFilter = "all" | ProgramType;
type StatusFilter = "active" | "ended" | "all";
type Sort = "featured" | "starting" | "ending" | "name";

const SORTS: readonly Option<Sort>[] = [
  { value: "featured", label: "Featured" },
  { value: "starting", label: "Starting soon" },
  { value: "ending", label: "Ending soon" },
  { value: "name", label: "Name A–Z" },
];
const ORDER: Record<ContentStatus, number> = { live: 0, upcoming: 1, ended: 2 };

function multiplierFor(p: RewardsProgram, tier: TierId | null): number | null {
  if (tier === null || !p.tierMultipliers) return null;
  return p.tierMultipliers[tier] ?? null;
}

export function ProgramsBrowser({ tier }: { tier: TierId | null }) {
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<Sort>("featured");
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => setOpenId(readQueryParam("program")), []);
  const open = (id: string | null): void => {
    setOpenId(id);
    writeQueryParam("program", id);
  };
  const st = (p: RewardsProgram): ContentStatus => effectiveStatus({ status: p.status, start: p.schedule.start, end: p.schedule.end }, now);
  const presentTypes = PROGRAM_TYPES.filter((t) => REWARDS_PROGRAMS.some((p) => p.type === t));

  const list = useMemo(() => {
    const t = (d?: string): number => (d ? Date.parse(d) : Number.POSITIVE_INFINITY);
    const out = REWARDS_PROGRAMS.filter((p) => {
      const s = effectiveStatus({ status: p.status, start: p.schedule.start, end: p.schedule.end }, now);
      return (type === "all" || p.type === type) && (status === "all" || (status === "ended" ? s === "ended" : s !== "ended"));
    });
    const sOf = (p: RewardsProgram): ContentStatus => effectiveStatus({ status: p.status, start: p.schedule.start, end: p.schedule.end }, now);
    switch (sort) {
      case "featured": return out.sort((a, b) => ORDER[sOf(a)] - ORDER[sOf(b)]);
      case "starting": return out.sort((a, b) => t(a.schedule.start) - t(b.schedule.start));
      case "ending": return out.sort((a, b) => t(a.schedule.end) - t(b.schedule.end));
      case "name": return out.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [type, status, sort, now]);
  const selected = openId ? REWARDS_PROGRAMS.find((p) => p.id === openId) ?? null : null;

  if (REWARDS_PROGRAMS.length === 0) {
    return (
      <EmptyState icon={Sparkles} title="No reward programs yet">
        Partner boosts, tier multipliers and campaigns are coming soon. Your protocol proposer payouts above are already tracked live.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Segmented
          label="Program status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Live & upcoming" },
            { value: "ended", label: "Ended" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {presentTypes.length > 1 ? (
            <Segmented label="Program type" value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...presentTypes.map((t) => ({ value: t, label: PROGRAM_TYPE_LABEL[t] }))]} />
          ) : (
            <span />
          )}
          <SortSelect value={sort} onChange={setSort} options={SORTS} />
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nothing here" action={<button className="btn-ghost text-xs" onClick={() => { setType("all"); setStatus("all"); }}>Show all programs</button>}>
          No programs match these filters.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => {
            const m = multiplierFor(p, tier);
            return (
              <button key={p.id} onClick={() => open(p.id)} className={`card flex flex-col p-4 text-left transition hover:border-white/25 ${st(p) === "ended" ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <Logo src={p.logo} name={p.source.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-gray-500">{PROGRAM_TYPE_LABEL[p.type]} · {p.source.name}</div>
                    <div className="font-semibold leading-snug text-white">{p.name}</div>
                  </div>
                  {m !== null && <span className="rounded-lg bg-amber-400/10 px-2 py-1 text-sm font-semibold text-amber-300">{m}×</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-gray-400">{p.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <StatusPill status={st(p)} />
                  {p.example && <ExamplePill />}
                  <CalendarDays className="ml-auto h-3 w-3" /> {formatDate(p.schedule.start) ?? "now"} → {formatDate(p.schedule.end) ?? "ongoing"}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {selected && <ProgramDetail program={selected} tier={tier} status={st(selected)} onClose={() => open(null)} />}
    </div>
  );
}

function ProgramDetail({ program: p, tier, status, onClose }: { program: RewardsProgram; tier: TierId | null; status: ContentStatus; onClose: () => void }) {
  return (
    <Modal
      onClose={onClose}
      title={
        <div className="flex items-start gap-3">
          <Logo src={p.logo} name={p.source.name} size={48} />
          <div className="min-w-0">
            <div className="text-xs text-gray-500">{PROGRAM_TYPE_LABEL[p.type]}</div>
            <h2 className="text-lg font-semibold leading-snug text-white">{p.name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <StatusPill status={status} />
              {p.example && <ExamplePill />}
            </div>
          </div>
        </div>
      }
      footer={
        p.source.url ? (
          <a className="btn-primary w-full" href={p.source.url} target="_blank" rel="noreferrer">
            View source: {p.source.name} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm text-gray-300">
        {(p.description ?? p.summary).split(/\n\s*\n/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-white/5 p-3 text-xs">
          <div><dt className="text-gray-500">Starts</dt><dd className="text-gray-200">{formatDate(p.schedule.start) ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Ends</dt><dd className="text-gray-200">{formatDate(p.schedule.end) ?? "ongoing"}</dd></div>
          <div><dt className="text-gray-500">Cadence</dt><dd className="text-gray-200">{p.schedule.cadence ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Reward</dt><dd className="text-gray-200">{p.rewardAsset ?? "—"}</dd></div>
        </dl>
        {p.tierMultipliers && (
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-gray-500">Tier multipliers</div>
            <ul className="grid grid-cols-5 gap-1.5 text-center text-xs">
              {TIERS.map((t) => {
                const m = p.tierMultipliers?.[t.id];
                const mine = tier === t.id;
                return (
                  <li key={t.id} className={`rounded-lg border p-2 ${mine ? "border-amber-400/50 bg-amber-400/10" : "border-white/10"}`}>
                    <div className="truncate" style={{ color: t.color }}>{t.name}</div>
                    <div className="mt-0.5 font-semibold text-white">{m !== undefined ? `${m}×` : "—"}</div>
                  </li>
                );
              })}
            </ul>
            {tier !== null && <p className="mt-2 text-xs text-gray-400">Your tier: {getTier(tier).name}.</p>}
          </div>
        )}
        <p className="text-xs text-gray-500">Source: {p.source.name}. NodeLink lists programs; payouts are made by the source.</p>
      </div>
    </Modal>
  );
}
