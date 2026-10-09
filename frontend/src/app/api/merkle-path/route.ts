// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { NextResponse, type NextRequest } from "next/server";
import { getMerklePathForCommitment, isFieldElement, makeAlgod, makeIndexer } from "@nodelink/shared";
import { APP_ID, ENDPOINTS } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/merkle-path?commitment=<decimal|0xhex>
 *
 * Off-chain tree indexer endpoint used by the Link Wizard. Rebuilds the commitment's tier
 * tree from ARC-28 LeafDeposited events and returns the Merkle path against the newest
 * root that the root updater has already posted on-chain.
 *
 * Privacy note: the server learns which commitment is being looked up (and the caller's
 * IP). Self-host this route, or fetch the full leaf list and build the path client-side,
 * if that matters for your threat model.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (APP_ID === null) return NextResponse.json({ error: "App not deployed (NEXT_PUBLIC_APP_ID unset)" }, { status: 503 });
  const raw = req.nextUrl.searchParams.get("commitment") ?? "";
  let commitment: bigint;
  try {
    commitment = BigInt(raw);
  } catch {
    return NextResponse.json({ error: "commitment must be a decimal or 0x-hex field element" }, { status: 400 });
  }
  if (!isFieldElement(commitment)) return NextResponse.json({ error: "commitment out of field range" }, { status: 400 });
  try {
    const res = await getMerklePathForCommitment(makeAlgod(ENDPOINTS), makeIndexer(ENDPOINTS), APP_ID, commitment);
    return NextResponse.json({
      tier: res.tier,
      leafIndex: res.path.leafIndex,
      root: res.path.root.toString(),
      pathElements: res.path.pathElements.map((e) => e.toString()),
      pathIndices: res.path.pathIndices,
      rootSlot: res.rootSlot.slot,
      rootLeafCount: res.rootSlot.leafCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, retryable: /root updater|catching up/.test(msg) }, { status: 404 });
  }
}
