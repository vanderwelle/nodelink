"use client";

import { Globe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Toggle } from "@/components/ui";
import { explorerTx } from "@/lib/config";
import { errorMessage } from "@/lib/format";
import { sendHideProfile, sendRevealProfile } from "@/lib/protocol";
import type { LinkSession } from "@/lib/session";

export function ProfileToggle(props: { hot: string; session: LinkSession | null; publicCold: string | null; active: boolean; onChanged: () => void }) {
  const { hot, session, publicCold, active, onChanged } = props;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string; tx?: string } | null>(null);
  const isPublic = publicCold !== null;

  const toggle = async (next: boolean): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      if (next) {
        if (!session) throw new Error("No linked cold wallet in this browser.");
        const tx = await sendRevealProfile(hot, session.coldAddress);
        setMsg({ tone: "ok", text: "Profile is now public.", tx });
      } else {
        const tx = await sendHideProfile(hot);
        setMsg({ tone: "ok", text: "Profile hidden (historic transactions stay visible on-chain).", tx });
      }
      onChanged();
    } catch (err) {
      setMsg({ tone: "warn", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2 font-semibold text-white">
          <Globe className="h-4 w-4 text-accent" /> Make Profile Public
        </div>
        <p className="mt-1 max-w-2xl text-xs text-gray-400">
          Publishes <em>hot → cold</em> on-chain and lists you on the <Link href="/leaderboard" className="underline">leaderboard</Link>. This
          permanently breaks unlinkability for these wallets. Your cold wallet must co-sign (it pays the box deposit), so
          keep it connected in a second wallet app. No authority is granted to either wallet.
        </p>
        {msg && (
          <p className={`mt-2 text-xs ${msg.tone === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
            {msg.text}{" "}
            {msg.tx && (
              <a className="underline" href={explorerTx(msg.tx)} target="_blank" rel="noreferrer">
                view tx
              </a>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">{isPublic ? "Public" : "Private"}</span>
        <Toggle checked={isPublic} onChange={(v) => void toggle(v)} disabled={busy || (!isPublic && (!active || !session))} label="Make profile public" />
      </div>
    </div>
  );
}
