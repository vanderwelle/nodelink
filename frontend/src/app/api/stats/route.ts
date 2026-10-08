import { NextResponse } from "next/server";
import { fetchLeafCounts, fetchRootSlots, makeAlgod } from "@nodelink/shared";
import { APP_ID, ENDPOINTS, NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

export interface StatsResponse {
  network: string;
  lastRound: string;
  onlineStakeMicroAlgos: string | null;
  totalSupplyMicroAlgos: string | null;
  appId: string | null;
  leafCounts: Record<string, number> | null;
  totalClaims: string | null;
  postedRoots: number | null;
  testnetBypass: boolean | null;
}

export async function GET(): Promise<NextResponse<StatsResponse | { error: string }>> {
  try {
    const algod = makeAlgod(ENDPOINTS);
    const [status, supply] = await Promise.all([algod.status().do(), algod.supply().do()]);
    let leafCounts: Record<string, number> | null = null;
    let totalClaims: string | null = null;
    let postedRoots: number | null = null;
    let testnetBypass: boolean | null = null;
    if (APP_ID !== null) {
      const [counts, slots, app] = await Promise.all([
        fetchLeafCounts(algod, APP_ID),
        fetchRootSlots(algod, APP_ID),
        algod.getApplicationByID(APP_ID).do(),
      ]);
      leafCounts = counts;
      postedRoots = slots.length;
      for (const kv of app.params?.globalState ?? []) {
        const k = new TextDecoder().decode(kv.key);
        if (k === "total_claims") totalClaims = kv.value.uint.toString();
        if (k === "testnet_skip_online_check") testnetBypass = kv.value.uint === 1n;
      }
    }
    return NextResponse.json({
      network: NETWORK,
      lastRound: status.lastRound.toString(),
      onlineStakeMicroAlgos: supply.onlineMoney.toString(),
      totalSupplyMicroAlgos: supply.totalMoney.toString(),
      appId: APP_ID?.toString() ?? null,
      leafCounts,
      totalClaims,
      postedRoots,
      testnetBypass,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
