// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { CheckCircle2, ChevronDown, Cpu, Download, Gauge, HardDrive, KeyRound, MemoryStick, Network, RefreshCw, Server, Terminal, Wifi, Wrench } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { NetPill } from "@/components/hub/NetPill";
import { Kbd } from "@/components/Kbd";
import { SourceLink, SourceList } from "@/components/SourceLinks";
import { CodeBlock, Notice } from "@/components/ui";
import { NODEKIT_CMD, NODEKIT_INSTALL, type NodekitSource } from "@/content/nodekit";
import { CONTRACT_LABEL, TELEMETRY } from "@/lib/config";

const HARDWARE = [
  { icon: Cpu, title: "8 vCPU", body: "A modern mini PC or small server. Mini PCs are popular with home node runners." },
  { icon: MemoryStick, title: "16 GB RAM", body: "The official validator spec; leaves headroom for upgrades." },
  { icon: HardDrive, title: "100 GB+ NVMe SSD", body: "Fast NVMe storage matters most for staying in sync. Avoid SD cards and HDDs." },
  { icon: Wifi, title: "Fast, always-on connection", body: "Official spec: 1 Gbps, < 100 ms latency. Wired Ethernet and a UPS are strongly recommended." },
] as const;

interface Step {
  readonly icon: ComponentType<{ className?: string }>;
  readonly title: string;
  readonly body: ReactNode;
  readonly code?: { readonly title: string; readonly code: string }[];
  readonly source: NodekitSource;
}

const NODEKIT_STEPS: readonly Step[] = [
  {
    icon: Download,
    title: "Install NodeKit",
    body: <>On the machine that will run your node, paste one command. It downloads NodeKit into the current folder and immediately starts the bootstrap.</>,
    code: [
      { title: "Linux", code: NODEKIT_INSTALL.linux },
      { title: "macOS", code: NODEKIT_INSTALL.macos },
    ],
    source: "quickStart",
  },
  {
    icon: Wrench,
    title: "Bootstrap the node",
    body: (
      <>
        Answer <Kbd>y</Kbd> to install a node and <Kbd>y</Kbd> to fast-catchup (syncs in 30–60 minutes instead of days). Enter your computer password when
        asked — it&apos;s needed to install software. If bootstrap didn&apos;t start, run it yourself:
      </>
    ),
    code: [{ title: "terminal", code: NODEKIT_CMD.bootstrap }],
    source: "quickStart",
  },
  {
    icon: RefreshCw,
    title: "Wait for sync",
    body: (
      <>
        NodeKit opens automatically. The yellow <strong>FAST-CATCHUP</strong> label turns into a green <strong>RUNNING</strong> label when done (usually 30–60 min). If it
        isn&apos;t catching up, quit with <Kbd>q</Kbd>, start catchup, then reopen NodeKit:
      </>
    ),
    code: [{ title: "terminal", code: `${NODEKIT_CMD.catchup}\n${NODEKIT_CMD.open}` }],
    source: "quickStart",
  },
  {
    icon: KeyRound,
    title: "Generate participation keys",
    body: (
      <>
        With the node <strong>RUNNING</strong>, press <Kbd>g</Kbd>, enter your account address and pick a duration (<Kbd>S</Kbd> cycles days / months / rounds;
        30–90 days recommended). A 30-day key takes about 4–6 minutes to generate. Participation keys can only vote — they can&apos;t move funds.
      </>
    ),
    code: [{ title: "terminal", code: NODEKIT_CMD.open }],
    source: "quickStart",
  },
  {
    icon: Network,
    title: "Register online with your wallet",
    body: (
      <>
        Press <Kbd>r</Kbd>. NodeKit shows a link to the Lora transaction wizard with your key pre-filled — or press <Kbd>s</Kbd> for a QR code you scan with
        Pera on your phone. Sign, and NodeKit detects the registration; your account <strong>STATUS</strong> shows <strong>ONLINE</strong>. By default this
        includes the 2 ALGO fee that makes you eligible for staking rewards (accounts over 30,000 ALGO earn per proposed block). To skip that, start
        NodeKit with <code className="font-mono text-gray-200">{NODEKIT_CMD.openNoIncentives}</code>.
      </>
    ),
    source: "quickStart",
  },
] as const;

const MAINTAIN = [
  {
    icon: KeyRound,
    title: "Renew keys before they expire",
    body: (
      <>
        Same flow as above: <Kbd>g</Kbd> → address → duration, then <Kbd>r</Kbd> to register the new key. Old keys can be removed from the key screen with{" "}
        <Kbd>D</Kbd>. NodeLink&apos;s <Link className="text-accent underline" href="/health">Health tab</Link> warns you 14 days ahead.
      </>
    ),
    source: "quickStart" as NodekitSource,
  },
  {
    icon: Gauge,
    title: "Upgrade the node software",
    body: <>Upgrades the Algorand packages installed by NodeKit.</>,
    code: NODEKIT_CMD.upgrade,
    source: "upgrade" as NodekitSource,
  },
  {
    icon: Download,
    title: "Update NodeKit itself",
    body: <>Re-run the install command in the same folder; it asks whether to upgrade the existing nodekit file.</>,
    code: NODEKIT_INSTALL.linux,
    source: "site" as NodekitSource,
  },
  {
    icon: Server,
    title: "Start / stop the node",
    body: <>Start or stop the Algorand daemon.</>,
    code: `${NODEKIT_CMD.start}\n${NODEKIT_CMD.stop}`,
    source: "startStop" as NodekitSource,
  },
] as const;

const MANUAL_STEPS = [
  {
    icon: Terminal,
    title: "1 · OS & tooling",
    body: "Install Ubuntu Server 24.04 LTS (x86_64) or Raspberry Pi OS 64-bit (Bookworm). Then install the AlgoKit CLI for developer tooling.",
    code: `sudo apt update && sudo apt full-upgrade -y
sudo apt install -y pipx curl gnupg2 software-properties-common
pipx ensurepath && pipx install algokit
algokit --version`,
  },
  {
    icon: Server,
    title: "2 · Install the Algorand node (algod)",
    body: "Use Algorand's official package repository (works on amd64 and arm64). Alternatively, NodeKit (nodekit.run) wraps all of this in a guided TUI.",
    code: `curl -fsSL https://releases.algorand.com/key.pub | sudo tee /etc/apt/trusted.gpg.d/algorand.asc
sudo add-apt-repository "deb [arch=$(dpkg --print-architecture)] https://releases.algorand.com/deb/ stable main"
sudo apt update && sudo apt install -y algorand
export ALGORAND_DATA=/var/lib/algorand
sudo systemctl enable --now algorand
goal node status`,
  },
  {
    icon: RefreshCw,
    title: "3 · Fast catchup",
    body: "Sync from the latest catchpoint instead of replaying the full chain. Wait until 'Sync Time: 0.0s' and the last round keeps advancing.",
    code: `export ALGORAND_DATA=/var/lib/algorand
# MainNet catchpoint (use channel/testnet for TestNet)
CATCHPOINT=$(curl -s https://algorand-catchpoints.s3.us-east-2.amazonaws.com/channel/mainnet/latest.catchpoint)
sudo -u algorand goal node catchup "$CATCHPOINT"
watch -n 5 goal node status`,
  },
  {
    icon: KeyRound,
    title: "4 · Participation keys",
    body: "Generate participation keys for your cold account on the node. Participation keys can only vote — they cannot move funds.",
    code: `export ALGORAND_DATA=/var/lib/algorand
ADDR=YOUR_COLD_WALLET_ADDRESS
FIRST=$(goal node status | awk '/Last committed block/ {print $4}')
LAST=$((FIRST + 3000000))      # ~3.3 months of rounds
sudo -u algorand goal account addpartkey -a "$ADDR" --roundFirstValid "$FIRST" --roundLastValid "$LAST"
goal account partkeyinfo`,
  },
  {
    icon: Network,
    title: "5 · Go online (keyreg)",
    body: "Create the key-registration transaction on the node, then sign it with your cold/hardware wallet (e.g. via Lora or Pera). A 2 ALGO keyreg fee makes the account eligible for block-proposal rewards.",
    code: `export ALGORAND_DATA=/var/lib/algorand
goal account changeonlinestatus -a "$ADDR" -o=1 --fee 2000000 -t online.txn
# sign online.txn with your cold wallet (never import the cold key on the node), then:
goal clerk rawsend -f online.txn.signed
goal account dump -a "$ADDR" | grep -E 'onl|vote'`,
  },
] as const;

export default function StartNodePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-white">Start a node</h1>
        <p className="mt-2 text-gray-400">
          The easy way: <strong className="text-white">NodeKit</strong>, the Algorand Foundation&apos;s terminal app for installing, syncing and managing a node —
          including participation keys. No Linux expertise needed.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <SourceLink source="quickStart" />
          <SourceLink source="site" />
        </div>
      </div>

      <Notice title="Which network?">
        NodeKit sets up a <strong>MainNet</strong> node — the network where staking rewards are paid.{" "}
        {TELEMETRY.network === "mainnet" ? (
          <>
            The hub&apos;s <strong>Health</strong>, <strong>Rewards</strong> and <strong>Setup</strong> tabs read your node&apos;s public <strong>MainNet</strong> data (read-only), so
            it shows up as soon as you watch its address. NodeLink badges, perks and the leaderboard are still a <strong>{CONTRACT_LABEL} preview</strong>: every NodeLink
            transaction is {CONTRACT_LABEL}-only and the app refuses to sign anything on MainNet.
          </>
        ) : (
          <>
            This NodeLink build reads <strong>{TELEMETRY.label}</strong> accounts, so a MainNet node won&apos;t show up in the hub here.
          </>
        )}
        <span className="mt-2 flex flex-wrap gap-1.5">
          <NetPill kind="data" />
          <NetPill kind="contract" />
        </span>
      </Notice>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-400">Hardware</h2>
        <p className="mb-4 text-xs text-gray-500">
          Official validator spec. <SourceLink source="hardware" />
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {HARDWARE.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card flex gap-4 p-5">
              <Icon className="h-6 w-6 shrink-0 text-accent" />
              <div>
                <div className="font-medium text-white">{title}</div>
                <p className="mt-1 text-sm text-gray-400">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Set up with NodeKit</h2>
        <ol className="space-y-4">
          {NODEKIT_STEPS.map(({ icon: Icon, title, body, code, source }, i) => (
            <li key={title} className="card space-y-3 p-5 sm:p-6">
              <h3 className="flex items-center gap-3 font-semibold text-white">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm text-accent">{i + 1}</span>
                <Icon className="h-5 w-5 shrink-0 text-accent" /> {title}
              </h3>
              <p className="text-sm leading-relaxed text-gray-400">{body}</p>
              {code?.map((c) => <CodeBlock key={c.title} title={c.title} code={c.code} />)}
              <SourceLink source={source} />
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> You&apos;re participating in consensus. Track it in the{" "}
          <Link href="/health" className="underline">Health tab</Link>.
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Keep it healthy</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {MAINTAIN.map((m) => (
            <div key={m.title} className="card min-w-0 space-y-3 p-5">
              <h3 className="flex items-center gap-2 font-medium text-white">
                <m.icon className="h-4 w-4 shrink-0 text-accent" /> {m.title}
              </h3>
              <p className="text-sm text-gray-400">{m.body}</p>
              {"code" in m && <CodeBlock code={m.code} />}
              <SourceLink source={m.source} />
            </div>
          ))}
        </div>
      </section>

      <details className="card group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="flex items-center gap-2 font-semibold text-white">
              <Terminal className="h-5 w-5 text-gray-400" /> Advanced: manual setup
            </span>
            <span className="mt-1 block text-xs text-gray-500">algod + goal commands for people who prefer doing it by hand</span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-gray-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t border-white/10 p-5">
          {MANUAL_STEPS.map(({ icon: Icon, title, body, code }) => (
            <div key={title} className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold text-white">
                <Icon className="h-5 w-5 text-gray-400" /> {title}
              </h3>
              <p className="text-sm text-gray-400">{body}</p>
              <CodeBlock code={code} />
            </div>
          ))}
        </div>
      </details>

      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Sources</h2>
        <SourceList sources={["quickStart", "overview", "site", "repo", "catchup", "upgrade", "startStop", "hardware"]} />
      </section>

      <Notice tone="warn" title="Security reminders">
        Keep your account&apos;s spending key off the node — only participation keys live there; sign registrations in your wallet (Lora or Pera). Renew
        participation keys before they expire, and double-check commands against the official docs linked above.
      </Notice>
    </div>
  );
}
