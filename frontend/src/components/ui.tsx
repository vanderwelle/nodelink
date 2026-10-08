"use client";

import { AlertTriangle, Check, Copy, Info, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { DownloadProgress } from "@/lib/zk";

export function ProgressBar({ label, progress }: { label: string; progress: DownloadProgress }) {
  const pct = progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;
  const mb = (n: number): string => (n / 1_048_576).toFixed(2);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="font-mono">
          {mb(progress.loaded)} MB{progress.total ? ` / ${mb(progress.total)} MB` : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full rounded-full bg-accent transition-all ${pct === null ? "animate-pulse" : ""}`}
          style={{ width: `${pct ?? 30}%` }}
        />
      </div>
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "ok"; title?: string; children: ReactNode }) {
  const styles = {
    info: "border-sky-400/30 bg-sky-400/5 text-sky-200",
    warn: "border-amber-400/30 bg-amber-400/5 text-amber-200",
    ok: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  }[tone];
  const Icon = tone === "warn" ? AlertTriangle : tone === "ok" ? ShieldCheck : Info;
  return (
    <div className={`flex gap-3 rounded-xl border p-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <div className="mb-0.5 font-medium">{title}</div>}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}

export function CodeBlock({ code, title }: { code: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-950">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-gray-400">
        <span>{title ?? "shell"}</span>
        <button
          className="flex items-center gap-1 hover:text-white"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-gray-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? "bg-accent" : "bg-ink-600"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
