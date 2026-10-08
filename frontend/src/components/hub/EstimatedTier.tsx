import { getTier, type TierId } from "@nodelink/shared";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { NetPill } from "@/components/hub/NetPill";
import { TELEMETRY } from "@/lib/config";
import { formatAlgo } from "@/lib/format";

/**
 * Tier the watched node's balance WOULD qualify for. Deliberately styled unlike the on-chain
 * NodeLink badge (dashed outline, no badge icon, "estimate" label): it proves nothing.
 */
export function EstimatedTierCard({ tier, balance }: { tier: TierId | null; balance: bigint }) {
  const info = tier ? getTier(tier) : null;
  return (
    <section className="rounded-2xl border border-dashed border-white/20 p-4" data-testid="estimated-tier">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-400">
          <Calculator className="h-3.5 w-3.5" /> Eligible tier based on {TELEMETRY.label} balance
        </div>
        <NetPill kind="data" />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-semibold text-gray-200">
          {info ? (
            <>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: info.color }} />
              {info.name} <span className="text-sm font-normal text-gray-500">(tier {info.id})</span>
            </>
          ) : (
            "Below Scout"
          )}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gray-400">estimate</span>
        <span className="text-xs text-gray-500">{formatAlgo(balance, 0)}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Not a NodeLink badge. Badges are proven privately and recorded by the contract in <span className="text-fuchsia-300">TestNet preview</span> —{" "}
        <Link href="/link" className="text-accent underline">
          get one
        </Link>
        .
      </p>
    </section>
  );
}
