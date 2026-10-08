import { NextResponse } from "next/server";
import algosdk from "algosdk";
import { BOX_PREFIX, boxName, decodeHotStatus, makeAlgod, readBox } from "@nodelink/shared";
import { APP_ID, ENDPOINTS } from "@/lib/config";

export const dynamic = "force-dynamic";

export interface LeaderboardEntry {
  hot: string;
  cold: string;
  tier: number;
  expiryRound: string;
  coldBalanceMicroAlgos: string;
  coldOnline: boolean;
}

/** Only users who explicitly opted in via reveal_public_profile appear here. */
export async function GET(): Promise<NextResponse<{ entries: LeaderboardEntry[]; round: string } | { error: string }>> {
  if (APP_ID === null) return NextResponse.json({ entries: [], round: "0" });
  try {
    const algod = makeAlgod(ENDPOINTS);
    const prefix = new TextEncoder().encode(BOX_PREFIX.publicProfile);
    const boxes = await algod.getApplicationBoxes(APP_ID).max(1000).do();
    const hotKeys = boxes.boxes
      .map((b) => b.name)
      .filter((n) => n.length === prefix.length + 32 && prefix.every((v, i) => n[i] === v))
      .map((n) => algosdk.encodeAddress(n.slice(prefix.length)))
      .slice(0, 100);
    const entries = (
      await Promise.all(
        hotKeys.map(async (hot): Promise<LeaderboardEntry | null> => {
          const [coldRaw, statusRaw] = await Promise.all([
            readBox(algod, APP_ID as bigint, boxName.publicProfile(hot)),
            readBox(algod, APP_ID as bigint, boxName.hotStatus(hot)),
          ]);
          if (!coldRaw || coldRaw.length !== 32) return null;
          const cold = algosdk.encodeAddress(coldRaw);
          const status = statusRaw ? decodeHotStatus(statusRaw) : null;
          const info = await algod.accountInformation(cold).exclude("all").do();
          return {
            hot,
            cold,
            tier: status?.tier ?? 0,
            expiryRound: (status?.expiryRound ?? 0n).toString(),
            coldBalanceMicroAlgos: info.amount.toString(),
            coldOnline: info.status === "Online",
          };
        }),
      )
    ).filter((e): e is LeaderboardEntry => e !== null);
    entries.sort((a, b) => (BigInt(b.coldBalanceMicroAlgos) > BigInt(a.coldBalanceMicroAlgos) ? 1 : -1));
    const status = await algod.status().do();
    return NextResponse.json({ entries, round: status.lastRound.toString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
