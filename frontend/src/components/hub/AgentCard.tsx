"use client";

import { BellRing, ChevronDown, ExternalLink, Lock } from "lucide-react";
import { CodeBlock } from "@/components/ui";

export const AGENT_INSTALL = "curl -fsSL https://raw.githubusercontent.com/vanderwelle/nodelink/main/agent/install.sh | sudo bash";
const AGENT_MANUAL = `git clone https://github.com/vanderwelle/nodelink.git
sudo bash nodelink/agent/install.sh`;
const AGENT_CONFIG = `sudo nano /etc/nodelink-agent/agent.ini
#  [telegram] bot_token = 123456789:AA…   chat_id = 123456789
#  [discord]  webhook_url = https://discord.com/api/webhooks/…
sudo systemctl restart nodelink-agent
sudo nodelink-agent test-alert`;
const README = "https://github.com/vanderwelle/nodelink/tree/main/agent";

const ALERTS = [
  "Node down (algod stopped / API not answering)",
  "No new block for 60 s · out of sync / catching up",
  "Account went offline · lost incentive eligibility",
  "Participation key expires in 7 d / 1 d / expired · key not on this node",
  "CPU temperature high · Raspberry Pi throttling / under-voltage",
  "Disk space low",
  "Recovery message for each · optional daily summary",
];

/** Install card for the on-node watchdog (agent/ in the repo). Shown on Health and Setup. */
export function AgentCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details className="card group overflow-hidden" open={defaultOpen} data-testid="agent-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400">
          <BellRing className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-white">Install the NodeLink agent</span>
          <span className="block text-xs text-gray-400">Phone alerts from your node via Telegram or Discord — read-only, ~19 MB RAM, lowest priority</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition group-open:rotate-180" />
      </summary>
      <div className="min-w-0 space-y-3 border-t border-white/10 p-4 text-sm">
        <p className="text-gray-300">
          Run once on your node (Raspberry Pi 5 arm64 or x86 mini PC with NodeKit). It reads your local algod every 30 s and messages <em>your own</em> bot
          when something changes.
        </p>
        <CodeBlock title="on your node" code={AGENT_INSTALL} />
        <p className="flex gap-1.5 text-xs text-amber-300/90">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The NodeLink repo is still private, so this one-liner only works once it is public. Until then clone it with your GitHub login (use a personal access token
            as the password) and run the same installer:
          </span>
        </p>
        <CodeBlock title="on your node (manual)" code={AGENT_MANUAL} />
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Then add your alert channel</div>
        <CodeBlock title="on your node" code={AGENT_CONFIG} />
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Alerts it sends</div>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-300">
            {ALERTS.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-gray-500">
          Nothing is sent to NodeLink. Data leaves your node only as alerts to your channels, plus an optional public round check from Nodely.
        </p>
        <a className="inline-flex items-center gap-1 text-xs text-accent" href={README} target="_blank" rel="noreferrer">
          Agent README <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </details>
  );
}
