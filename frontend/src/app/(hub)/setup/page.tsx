"use client";

import { ArrowRight, BookOpen, ExternalLink, KeyRound, Link2, PlugZap, Power, RefreshCw, Server } from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { SectionHeader } from "@/components/hub/HubTabs";
import { getSection } from "@/components/hub/sections";
import { CodeBlock, Notice } from "@/components/ui";
import { ENDPOINTS } from "@/lib/config";
import { roundsToDuration } from "@/lib/format";
import { useNode } from "@/lib/node";

const S = getSection("setup");
const KEY_ROUNDS = 3_000_000n; // ~3.3 months

function Shortcut({ icon: Icon, title, sub, children, defaultOpen = false }: { icon: ComponentType<{ className?: string }>; title: string; sub: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sky-400">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-white">{title}</span>
          <span className="block text-xs text-gray-400">{sub}</span>
        </span>
        <ArrowRight className={`h-4 w-4 shrink-0 text-gray-500 transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="space-y-3 border-t border-white/10 p-4">{children}</div>}
    </div>
  );
}

export default function SetupPage() {
  const node = useNode(60_000);
  const t = node.telemetry;
  const addr = node.nodeAddress ?? "YOUR_NODE_ACCOUNT_ADDRESS";
  const first = t ? t.round.toString() : "$(goal node status | awk '/Last committed block/ {print $4}')";
  const last = t ? (t.round + KEY_ROUNDS).toString() : "$((FIRST + 3000000))";
  const keyLeft = t?.voteLastValid != null ? t.voteLastValid - t.round : null;
  const wizard = `${ENDPOINTS.explorer}/transaction-wizard`;

  return (
    <div className="space-y-6">
      <SectionHeader title={S.title} sub="Set up a node, rotate keys and change online status — commands pre-filled for your node." icon={S.icon} tone={S.tone} />

      <Link href="/start-node" className="card flex items-center gap-4 p-4 transition hover:border-sky-400/40">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-400">
          <Server className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-white">Start a node from scratch</span>
          <span className="block text-xs text-gray-400">Hardware, install, fast catchup, keys, going online</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
      </Link>

      <div className="space-y-3">
        <Shortcut
          icon={KeyRound}
          title="Renew participation key"
          sub={keyLeft !== null ? `current key expires in ${roundsToDuration(keyLeft)}` : "generate a fresh key on your node"}
          defaultOpen={keyLeft !== null && keyLeft < 30_857n * 14n}
        >
          <p className="text-xs text-gray-400">Run on the node. Participation keys can only vote — they cannot move funds.</p>
          <CodeBlock
            title="on your node"
            code={`export ALGORAND_DATA=/var/lib/algorand
ADDR=${addr}
FIRST=${first}
LAST=${last}   # ~3.3 months
sudo -u algorand goal account addpartkey -a "$ADDR" --roundFirstValid "$FIRST" --roundLastValid "$LAST"
goal account partkeyinfo`}
          />
          <p className="text-xs text-gray-400">Then send an online keyreg with the new key (next shortcut).</p>
        </Shortcut>

        <Shortcut icon={Power} title="Go online / offline (keyreg)" sub="sign with your node wallet — never import its key on the node">
          <CodeBlock
            title="online (incentive eligible: 2 ALGO fee)"
            code={`goal account changeonlinestatus -a "${addr}" -o=1 --fee 2000000 -t online.txn
# sign online.txn with your wallet, then:
goal clerk rawsend -f online.txn.signed`}
          />
          <CodeBlock title="offline" code={`goal account changeonlinestatus -a "${addr}" -o=0 -t offline.txn`} />
          <a className="btn-ghost w-full text-xs" href={wizard} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Build &amp; sign keyreg in Lora (works on mobile with Pera/Defly)
          </a>
        </Shortcut>

        <Shortcut icon={RefreshCw} title="Fast catchup" sub="re-sync a stalled or new node from the latest catchpoint">
          <CodeBlock
            title="on your node (TestNet)"
            code={`export ALGORAND_DATA=/var/lib/algorand
CATCHPOINT=$(curl -s https://algorand-catchpoints.s3.us-east-2.amazonaws.com/channel/testnet/latest.catchpoint)
sudo -u algorand goal node catchup "$CATCHPOINT"
watch -n 5 goal node status   # wait for "Sync Time: 0.0s"`}
          />
        </Shortcut>

        <Shortcut icon={PlugZap} title="Guided TUI: NodeKit" sub="install, sync and key management in one terminal app">
          <p className="text-xs text-gray-400">NodeKit wraps the steps above in an interactive terminal UI.</p>
          <a className="btn-ghost w-full text-xs" href="https://nodekit.run" target="_blank" rel="noreferrer">
            <BookOpen className="h-3.5 w-3.5" /> nodekit.run <ExternalLink className="h-3 w-3" />
          </a>
        </Shortcut>
      </div>

      <Notice title="Optional: private hot-wallet badge">
        Keep your node wallet offline from dApps by linking a separate daily wallet with a zero-knowledge proof.{" "}
        <Link href="/link" className="inline-flex items-center gap-1 underline">
          <Link2 className="h-3 w-3" /> Private link
        </Link>
      </Notice>
    </div>
  );
}
