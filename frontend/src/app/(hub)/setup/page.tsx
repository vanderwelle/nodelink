"use client";

import { ArrowRight, ChevronDown, ExternalLink, Gauge, KeyRound, Link2, Power, RefreshCw, Server, Terminal } from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { SectionHeader } from "@/components/hub/HubTabs";
import { NetPill } from "@/components/hub/NetPill";
import { getSection } from "@/components/hub/sections";
import { Kbd } from "@/components/Kbd";
import { SourceLink } from "@/components/SourceLinks";
import { CodeBlock, Notice } from "@/components/ui";
import { NODEKIT_CMD, NODEKIT_INSTALL } from "@/content/nodekit";
import { TELEMETRY } from "@/lib/config";
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

function NodeKitLabel() {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">With NodeKit (recommended)</div>;
}

/** Manual alternative, collapsed by default. */
function Manual({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-gray-400 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5" /> Manual (goal) alternative
        </span>
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-white/10 p-3">{children}</div>
    </details>
  );
}

export default function SetupPage() {
  const node = useNode(60_000);
  const t = node.telemetry;
  const addr = node.nodeAddress ?? "YOUR_NODE_ACCOUNT_ADDRESS";
  const first = t ? t.round.toString() : "$(goal node status | awk '/Last committed block/ {print $4}')";
  const last = t ? (t.round + KEY_ROUNDS).toString() : "$((FIRST + 3000000))";
  const keyLeft = t?.voteLastValid != null ? t.voteLastValid - t.round : null;
  // External link: keyreg is built and signed in Lora by the user's own wallet — NodeLink builds no transaction here.
  const wizard = `${TELEMETRY.explorer}/transaction-wizard`;
  const channel = TELEMETRY.catchpointChannel ?? "testnet";

  return (
    <div className="space-y-6">
      <SectionHeader title={S.title} sub="Run and maintain your node with NodeKit — the Algorand Foundation's node manager." icon={S.icon} tone={S.tone} />

      <Link href="/start-node" className="card flex items-center gap-4 p-4 transition hover:border-sky-400/40">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-400">
          <Server className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-white">New node? Start with NodeKit</span>
          <span className="block text-xs text-gray-400">One command installs, syncs and sets up keys — step-by-step guide</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
      </Link>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <NetPill kind="data" />
        {t ? (
          <span>
            Commands below are prefilled for your node from {TELEMETRY.label} round <span className="font-mono text-gray-200">#{t.round.toLocaleString()}</span>.
          </span>
        ) : (
          <span>Watch your node on the Health tab to prefill commands with your address and the current {TELEMETRY.label} round.</span>
        )}
      </div>

      <div className="space-y-3">
        <Shortcut
          icon={KeyRound}
          title="Renew participation key"
          sub={keyLeft !== null ? `current key expires in ${roundsToDuration(keyLeft)}` : "generate and register a fresh key"}
          defaultOpen={keyLeft !== null && keyLeft < 30_857n * 14n}
        >
          <NodeKitLabel />
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-300">
            <li>Open NodeKit on your node (it must show <strong>RUNNING</strong>).</li>
            <li>Press <Kbd>g</Kbd>, enter <span className="break-all font-mono text-xs text-gray-200">{addr}</span>, choose 30–90 days.</li>
            <li>When the key appears, press <Kbd>r</Kbd> and sign in Lora — or <Kbd>s</Kbd> to scan a QR code with Pera.</li>
            <li>Optional: delete the old key from its key screen with <Kbd>D</Kbd>.</li>
          </ol>
          <CodeBlock title="on your node" code={NODEKIT_CMD.open} />
          <SourceLink source="quickStart" />
          <Manual>
            <p className="text-xs text-gray-400">Participation keys can only vote — they cannot move funds. Then send an online keyreg (next shortcut).</p>
            <CodeBlock
              title="on your node"
              code={`export ALGORAND_DATA=/var/lib/algorand
ADDR=${addr}
FIRST=${first}
LAST=${last}   # ~3.3 months
sudo -u algorand goal account addpartkey -a "$ADDR" --roundFirstValid "$FIRST" --roundLastValid "$LAST"
goal account partkeyinfo`}
            />
          </Manual>
        </Shortcut>

        <Shortcut icon={Power} title="Go online / offline (keyreg)" sub="sign with your wallet — never put its spending key on the node">
          <NodeKitLabel />
          <p className="text-sm text-gray-300">
            In NodeKit, select your account (<Kbd>↑</Kbd>/<Kbd>↓</Kbd>, <Kbd>enter</Kbd>), open the key, then press <Kbd>r</Kbd> to register it online or offline. Online
            registration includes the 2 ALGO staking-rewards fee by default; launch with <span className="font-mono text-xs text-gray-200">{NODEKIT_CMD.openNoIncentives}</span> to skip it.
          </p>
          <SourceLink source="quickStart" />
          <Manual>
            <CodeBlock
              title="online (incentive eligible: 2 ALGO fee)"
              code={`goal account changeonlinestatus -a "${addr}" -o=1 --fee 2000000 -t online.txn
# sign online.txn with your wallet, then:
goal clerk rawsend -f online.txn.signed`}
            />
            <CodeBlock title="offline" code={`goal account changeonlinestatus -a "${addr}" -o=0 -t offline.txn`} />
            <a className="btn-ghost w-full text-xs" href={wizard} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Build &amp; sign keyreg in Lora ({TELEMETRY.label})
            </a>
          </Manual>
        </Shortcut>

        <Shortcut icon={RefreshCw} title="Fast catchup" sub="re-sync a stalled or new node in minutes">
          <NodeKitLabel />
          <p className="text-sm text-gray-300">Quit NodeKit with <Kbd>q</Kbd>, start fast-catchup, then reopen NodeKit and wait for <strong>RUNNING</strong>.</p>
          <CodeBlock title="on your node" code={`${NODEKIT_CMD.catchup}\n${NODEKIT_CMD.open}`} />
          <SourceLink source="catchup" />
          <Manual>
            <CodeBlock
              title={`on your node (${channel === "mainnet" ? "MainNet" : "TestNet"} catchpoint)`}
              code={`export ALGORAND_DATA=/var/lib/algorand
CATCHPOINT=$(curl -s https://algorand-catchpoints.s3.us-east-2.amazonaws.com/channel/${channel}/latest.catchpoint)
sudo -u algorand goal node catchup "$CATCHPOINT"
watch -n 5 goal node status   # wait for "Sync Time: 0.0s"`}
            />
          </Manual>
        </Shortcut>

        <Shortcut icon={Gauge} title="Upgrade" sub="node software and NodeKit itself">
          <NodeKitLabel />
          <p className="text-sm text-gray-300">Upgrade the Algorand node packages:</p>
          <CodeBlock title="on your node" code={NODEKIT_CMD.upgrade} />
          <SourceLink source="upgrade" />
          <p className="text-sm text-gray-300">Update NodeKit: re-run the installer in the same folder and answer <Kbd>y</Kbd> to upgrade.</p>
          <CodeBlock title="Linux" code={NODEKIT_INSTALL.linux} />
          <SourceLink source="site" />
        </Shortcut>

        <Shortcut icon={Server} title="Start / stop the node" sub="control the Algorand daemon">
          <NodeKitLabel />
          <CodeBlock title="on your node" code={`${NODEKIT_CMD.start}\n${NODEKIT_CMD.stop}`} />
          <SourceLink source="startStop" />
        </Shortcut>
      </div>

      <div className="flex justify-end">
        <NetPill kind="contract" />
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
