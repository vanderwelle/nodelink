import { Cpu, HardDrive, KeyRound, Network, RefreshCw, Server, Terminal, Wifi } from "lucide-react";
import Link from "next/link";
import { CodeBlock, Notice } from "@/components/ui";

const HARDWARE = [
  { icon: Cpu, title: "Raspberry Pi 5 (8 GB) or Mini PC", body: "Intel N100 / Core i5 class mini PCs are ideal; Pi 5 8 GB works well for a participation node." },
  { icon: Server, title: "8 GB+ RAM", body: "16 GB gives headroom for upgrades and monitoring tools." },
  { icon: HardDrive, title: "256 GB+ NVMe SSD", body: "Fast NVMe storage is the biggest factor for staying in sync. Avoid SD cards and HDDs." },
  { icon: Wifi, title: "24/7 wired Ethernet", body: "Stable, always-on connection with a UPS if possible. Wi-Fi is not recommended." },
] as const;

const STEPS = [
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
          Run an Algorand participation node, put your stake online, then come back to{" "}
          <Link href="/link" className="text-accent underline">link a hot wallet privately</Link>.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Hardware</h2>
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

      <section className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Software setup</h2>
        {STEPS.map(({ icon: Icon, title, body, code }) => (
          <div key={title} className="card space-y-3 p-6">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Icon className="h-5 w-5 text-accent" /> {title}
            </h3>
            <p className="text-sm text-gray-400">{body}</p>
            <CodeBlock code={code} />
          </div>
        ))}
      </section>

      <Notice tone="warn" title="Security reminders">
        Keep your cold wallet&apos;s spending key off the node — only participation keys live there. Renew participation keys before
        they expire, and monitor heartbeats from the NodeLink HUD. Double-check commands against the official Algorand developer
        docs for your OS version.
      </Notice>
    </div>
  );
}
