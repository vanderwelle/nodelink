import { TIERS, formatMultiplier } from "@nodelink/shared";
import { ArrowRight, EyeOff, KeyRound, Newspaper, Server, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { NetworkStats } from "@/components/NetworkStats";
import { RankBadge } from "@/components/RankBadge";
import { NEWS, PARTNERS } from "@/data/content";

const VALUE_PROPS = [
  { icon: EyeOff, title: "Unlinkable by default", body: "A Groth16 proof shows your hot wallet belongs to a node-runner tier — without revealing which cold wallet." },
  { icon: KeyRound, title: "Zero execution authority", body: "No rekeys, no delegated logicsigs. Your hot wallet gets a read-only status badge and nothing else." },
  { icon: ShieldCheck, title: "Front-run proof", body: "Proofs are bound to the claiming hot wallet's address; a copied proof is useless to anyone else." },
  { icon: Sparkles, title: "Opt-in fame", body: "Want to flex your stake? Reveal your profile publicly and climb the community leaderboard." },
] as const;

export default function LandingPage() {
  return (
    <div className="space-y-20">
      <section className="pt-10 text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
          <Zap className="h-3 w-3" /> Zero-knowledge identity for Algorand consensus runners
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white md:text-6xl">
          Keep your node wallet cold.
          <span className="block text-accent">Claim your perks hot.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-gray-400">
          NodeLink lets you prove you run an online consensus node — and how much you stake — from a daily hot wallet,
          without ever linking it to your cold wallet on-chain.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ConnectButton />
          <Link href="/start-node" className="btn-ghost">
            <Server className="h-4 w-4" /> Start a Node
          </Link>
          <Link href="/link" className="btn-ghost">
            Link wallets <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Network</h2>
        <NetworkStats />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-6">
            <Icon className="mb-3 h-6 w-6 text-accent" />
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm text-gray-400">{body}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Staker leveling system</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {TIERS.map((t) => (
            <div key={t.id} className="card p-4">
              <RankBadge tier={t.id} size="sm" />
              <div className="mt-3 font-semibold" style={{ color: t.color }}>{t.name}</div>
              <div className="text-xs text-gray-400">{t.minAlgo.toLocaleString()}+ ALGO</div>
              <div className="mt-2 text-sm text-white">{formatMultiplier(t.multiplierBps)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
            <Newspaper className="h-4 w-4" /> News
          </h2>
          <div className="space-y-3">
            {NEWS.map((n) => (
              <article key={n.title} className="card p-4">
                <div className="text-xs text-accent">{n.date}</div>
                <h3 className="font-medium text-white">{n.title}</h3>
                <p className="mt-1 text-sm text-gray-400">{n.body}</p>
              </article>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Partner dApps</h2>
          <div className="grid grid-cols-2 gap-3">
            {PARTNERS.map((p) => (
              <div key={p.name} className="card p-4">
                <div className="font-medium text-white">{p.name}</div>
                <div className="text-xs text-gray-400">{p.category}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Placeholder integrations for the TestNet preview — no partnerships implied.</p>
        </div>
      </section>
    </div>
  );
}
