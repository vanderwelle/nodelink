"use client";

import {
  TIERS,
  computeLeaf,
  decryptBackup,
  encodeProof,
  encodePublicSignals,
  encryptBackup,
  generateCommitment,
  getTier,
  parseEncryptedBackup,
  rootFromPath,
  tierForBalance,
  buildCircuitInput,
  type BackupPayload,
  type MerklePath,
  type TierId,
} from "@nodelink/shared";
import { useWallet } from "@txnlab/use-wallet-react";
import { CheckCircle2, Download, ExternalLink, FileKey, Flame, Loader2, Snowflake, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { RankBadge } from "@/components/RankBadge";
import { Notice, ProgressBar } from "@/components/ui";
import { fetchColdTelemetry, fetchMyStatus, type ColdTelemetry } from "@/lib/chain";
import { APP_ID, NETWORK, explorerTx } from "@/lib/config";
import { errorMessage, formatAlgo, shortAddress } from "@/lib/format";
import { NetPill } from "@/components/hub/NetPill";
import { sendClaim, sendDeposit } from "@/lib/protocol";
import { saveSession } from "@/lib/session";
import { proveInBrowser, type ProveProgress } from "@/lib/zk";

type Step = 1 | 2;

export default function LinkWizardPage() {
  const [step, setStep] = useState<Step>(1);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-white">
          Private Link Wizard <NetPill kind="contract" />
        </h1>
        <p className="text-sm text-gray-400">
          Prove your hot wallet belongs to a node-runner tier — without linking it to your cold wallet on-chain.
        </p>
      </div>
      {APP_ID === null && (
        <Notice tone="warn" title="Contract not configured">
          Set <code>NEXT_PUBLIC_APP_ID</code> (written by <code>npm run deploy:testnet</code>) to enable transactions.
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-2">
        {([1, 2] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`card flex items-center gap-3 p-4 text-left ${step === s ? "border-accent/60" : ""}`}
          >
            {s === 1 ? <Snowflake className="h-5 w-5 text-sky-400" /> : <Flame className="h-5 w-5 text-orange-400" />}
            <div>
              <div className="text-xs text-gray-500">Step {s}</div>
              <div className="font-medium text-white">{s === 1 ? "Cold setup" : "Hot activation"}</div>
            </div>
          </button>
        ))}
      </div>
      {step === 1 ? <ColdSetup onDone={() => setStep(2)} /> : <HotActivation />}
    </div>
  );
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ColdSetup({ onDone }: { onDone: () => void }) {
  const { activeAddress } = useWallet();
  const [telemetry, setTelemetry] = useState<ColdTelemetry | null>(null);
  const [tier, setTier] = useState<TierId | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ txId: string; leafIndex: number } | null>(null);
  const [bypass, setBypass] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch("/api/stats")
      .then((r) => r.json() as Promise<{ testnetBypass?: boolean | null }>)
      .then((s) => setBypass(s.testnetBypass ?? null))
      .catch(() => setBypass(null));
  }, []);

  useEffect(() => {
    setTelemetry(null);
    setResult(null);
    if (!activeAddress) return;
    fetchColdTelemetry(activeAddress)
      .then((t) => {
        setTelemetry(t);
        setTier(tierForBalance(t.balance)?.id ?? null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [activeAddress]);

  const eligible = telemetry ? tierForBalance(telemetry.balance) : null;
  const online = telemetry?.status === "Online";
  const canDeposit = activeAddress && tier !== null && pass.length >= 12 && pass === pass2 && (online || bypass === true) && APP_ID !== null;

  const run = async (): Promise<void> => {
    if (!activeAddress || tier === null || APP_ID === null) return;
    setError(null);
    try {
      setBusy("Generating secret, nullifier and commitment locally…");
      const secrets = generateCommitment(tier);
      const payload: BackupPayload = {
        version: 1,
        secret: secrets.secret.toString(),
        nullifier: secrets.nullifier.toString(),
        tier,
        leaf: secrets.leaf.toString(),
        coldAddress: activeAddress,
        appId: APP_ID.toString(),
        network: NETWORK,
        createdAt: new Date().toISOString(),
      };
      setBusy("Encrypting backup (PBKDF2 600k + AES-256-GCM)…");
      const encrypted = await encryptBackup(payload, pass);
      // Export BEFORE depositing so the secrets can never be lost after the deposit lands.
      downloadJson(`nodelink-backup-${APP_ID.toString()}-${Date.now()}.json`, encrypted);
      setBusy("Waiting for your cold wallet to sign deposit_commitment…");
      const res = await sendDeposit(activeAddress, secrets.leaf, tier);
      setResult(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">1 · Connect your cold (node) wallet</h2>
        <ConnectButton label="Connect Cold Wallet" className="btn-ghost" />
      </div>
      {activeAddress && telemetry && (
        <div className="grid gap-3 rounded-xl border border-white/10 bg-ink-800/50 p-4 text-sm md:grid-cols-3">
          <div>
            <div className="label">Cold wallet</div>
            <div className="font-mono">{shortAddress(activeAddress, 6)}</div>
          </div>
          <div>
            <div className="label">Balance</div>
            <div>{formatAlgo(telemetry.balance)}</div>
          </div>
          <div>
            <div className="label">Consensus</div>
            <div className={online ? "text-emerald-400" : "text-amber-400"}>{telemetry.status}</div>
          </div>
        </div>
      )}
      {activeAddress && telemetry && !online && (
        <Notice tone={bypass ? "info" : "warn"} title={bypass ? "TestNet bypass active" : "Account is offline"}>
          {bypass
            ? "This TestNet deployment was created with the testing-only flag that skips the online-participant check. On a production deployment only online consensus accounts can deposit."
            : "Only online consensus participants can deposit. Register participation keys first — see Start a Node."}
        </Notice>
      )}
      {telemetry && (
        <div>
          <div className="label">2 · Choose the tier to attest</div>
          <div className="grid gap-2 md:grid-cols-5">
            {TIERS.map((t) => {
              const ok = eligible !== null && t.id <= eligible.id;
              return (
                <button
                  key={t.id}
                  disabled={!ok}
                  onClick={() => setTier(t.id)}
                  className={`rounded-xl border p-3 text-left text-xs disabled:opacity-40 ${tier === t.id ? "border-accent bg-accent/10" : "border-white/10"}`}
                >
                  <div className="font-semibold" style={{ color: t.color }}>{t.name}</div>
                  <div className="text-gray-400">{t.minAlgo.toLocaleString()}+ ALGO</div>
                </button>
              );
            })}
          </div>
          {eligible === null && <p className="mt-2 text-xs text-amber-400">Balance below the Scout threshold (1 ALGO).</p>}
          <p className="mt-2 text-xs text-gray-500">
            Tip: attesting a lower tier than you qualify for puts you in a larger anonymity set.
          </p>
        </div>
      )}
      {telemetry && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="pass">3 · Backup passphrase (≥ 12 chars)</label>
            <input id="pass" type="password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="label" htmlFor="pass2">Confirm passphrase</label>
            <input id="pass2" type="password" className="input" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
      )}
      {error && <Notice tone="warn" title="Error">{error}</Notice>}
      {result ? (
        <div className="space-y-3">
          <Notice tone="ok" title="Commitment deposited">
            Leaf #{result.leafIndex} in the {tier ? getTier(tier).name : ""} tree.{" "}
            <a className="underline" href={explorerTx(result.txId)} target="_blank" rel="noreferrer">View transaction</a>. Your encrypted
            backup was downloaded — keep it safe; it is the only way to activate a hot wallet.
          </Notice>
          <Notice tone="info" title="Before step 2 (privacy)">
            Disconnect your cold wallet, and wait a while (hours or more) before activating: claiming right after depositing lets
            observers correlate the two by timing. Never fund your hot wallet from your cold wallet.
          </Notice>
          <button className="btn-primary" onClick={onDone}>Continue to hot activation</button>
        </div>
      ) : (
        <button className="btn-primary" disabled={!canDeposit || busy !== null} onClick={() => void run()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ?? "Generate secrets, export backup & deposit"}
        </button>
      )}
    </div>
  );
}

interface PathResponse {
  tier: TierId;
  leafIndex: number;
  root: string;
  pathElements: string[];
  pathIndices: (0 | 1)[];
  rootSlot: number;
  rootLeafCount: number;
}

function HotActivation() {
  const { activeAddress } = useWallet();
  const [file, setFile] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [backup, setBackup] = useState<BackupPayload | null>(null);
  const [path, setPath] = useState<MerklePath | null>(null);
  const [pathInfo, setPathInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProveProgress | null>(null);
  const [proofMs, setProofMs] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ txId: string; tier: number } | null>(null);

  const isColdActive = backup !== null && activeAddress === backup.coldAddress;

  const unlock = async (): Promise<void> => {
    if (!file) return;
    setError(null);
    setBusy("Decrypting backup…");
    try {
      const payload = await decryptBackup(parseEncryptedBackup(file), pass);
      if (computeLeaf(BigInt(payload.secret), BigInt(payload.nullifier), payload.tier) !== BigInt(payload.leaf)) {
        throw new Error("Backup integrity check failed (leaf mismatch)");
      }
      if (APP_ID !== null && payload.appId !== APP_ID.toString()) {
        throw new Error(`Backup belongs to app ${payload.appId}, this UI targets app ${APP_ID.toString()}`);
      }
      setBackup(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const fetchPath = async (): Promise<void> => {
    if (!backup) return;
    setError(null);
    setBusy("Fetching Merkle path from the tree indexer…");
    try {
      const res = await fetch(`/api/merkle-path?commitment=${backup.leaf}`);
      const json = (await res.json()) as PathResponse | { error: string; retryable?: boolean };
      if ("error" in json) throw new Error(json.retryable ? `${json.error}. Try again in a minute.` : json.error);
      const p: MerklePath = {
        root: BigInt(json.root),
        leaf: BigInt(backup.leaf),
        leafIndex: json.leafIndex,
        pathElements: json.pathElements.map((e) => BigInt(e)),
        pathIndices: json.pathIndices,
      };
      if (rootFromPath(p.leaf, p.pathElements, p.pathIndices) !== p.root) throw new Error("Indexer returned an inconsistent path");
      setPath(p);
      setPathInfo(`Leaf #${json.leafIndex} · root slot ${json.rootSlot} · anonymity set ${json.rootLeafCount} ${getTier(json.tier).name} deposits`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const proveAndClaim = async (): Promise<void> => {
    if (!backup || !path || !activeAddress) return;
    setError(null);
    try {
      setBusy("Generating zero-knowledge proof in your browser…");
      const input = buildCircuitInput({
        secret: BigInt(backup.secret),
        nullifier: BigInt(backup.nullifier),
        tier: backup.tier,
        path,
        hotWalletAddress: activeAddress,
      });
      const { proof, publicSignals, millis } = await proveInBrowser(input, setProgress);
      setProofMs(millis);
      setBusy("Waiting for your hot wallet to sign [MBR payment + claim_status]…");
      const existing = await fetchMyStatus(activeAddress);
      const res = await sendClaim(activeAddress, encodeProof(proof), encodePublicSignals(publicSignals), existing !== null);
      saveSession({ hotAddress: activeAddress, coldAddress: backup.coldAddress, tier: backup.tier, linkedAt: new Date().toISOString(), claimTxId: res.txId });
      setDone({ txId: res.txId, tier: res.tier });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">1 · Connect your hot (daily) wallet</h2>
        <ConnectButton label="Connect Hot Wallet" className="btn-ghost" />
      </div>
      {isColdActive && (
        <Notice tone="warn" title="That is your cold wallet">
          Switch to a different (hot) wallet account before claiming — otherwise you would link the two yourself.
        </Notice>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="backup">2 · Import encrypted backup</label>
          <label className="input flex cursor-pointer items-center gap-2" htmlFor="backup">
            <Upload className="h-4 w-4" /> {file ? "Backup loaded" : "Choose nodelink-backup-*.json"}
          </label>
          <input
            id="backup"
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(setFile);
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="hpass">Passphrase</label>
          <input id="hpass" type="password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
      </div>
      {!backup ? (
        <button className="btn-ghost" disabled={!file || pass.length === 0 || busy !== null} onClick={() => void unlock()}>
          <FileKey className="h-4 w-4" /> Unlock backup
        </button>
      ) : (
        <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-ink-800/50 p-4">
          <RankBadge tier={backup.tier} />
          <div className="text-xs text-gray-400">Commitment for app {backup.appId} · created {new Date(backup.createdAt).toLocaleString()}</div>
        </div>
      )}

      {backup && (
        <div className="space-y-3">
          <div className="label">3 · Merkle path</div>
          {path ? (
            <p className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" /> {pathInfo}</p>
          ) : (
            <button className="btn-ghost" disabled={busy !== null} onClick={() => void fetchPath()}>Fetch Merkle path</button>
          )}
        </div>
      )}

      {path && (
        <div className="space-y-3">
          <div className="label">4 · Prove & claim</div>
          {progress && (
            <div className="space-y-2">
              <ProgressBar label="Circuit (node_membership.wasm)" progress={progress.wasm} />
              <ProgressBar label="Proving key (dev-only zkey)" progress={progress.zkey} />
              {progress.phase === "proving" && <p className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Computing Groth16 proof…</p>}
              {proofMs !== null && <p className="text-xs text-gray-400">Proof generated in {(proofMs / 1000).toFixed(1)} s</p>}
            </div>
          )}
          {!done && (
            <button className="btn-primary" disabled={!activeAddress || isColdActive || busy !== null || APP_ID === null} onClick={() => void proveAndClaim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />} {busy ?? "Generate proof & activate hot wallet"}
            </button>
          )}
          <p className="text-xs text-gray-500">
            The hot wallet pays ~0.05 ALGO box deposit + ~0.11 ALGO fees (on-chain BN254 pairing needs ~100 OpUp inner calls).
          </p>
        </div>
      )}

      {error && <Notice tone="warn" title="Error">{error}</Notice>}
      {done && (
        <Notice tone="ok" title="Hot wallet activated">
          Tier {done.tier} status recorded on-chain.{" "}
          <a className="inline-flex items-center gap-1 underline" href={explorerTx(done.txId)} target="_blank" rel="noreferrer">
            View transaction <ExternalLink className="h-3 w-3" />
          </a>{" "}
          · <Link className="underline" href="/health">Open your node hub</Link>
        </Notice>
      )}
    </div>
  );
}
