// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

export function useLeaderboard(): { entries: LeaderboardEntry[] | null; error: string | null } {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json() as Promise<{ entries: LeaderboardEntry[] } | { error: string }>)
      .then((j) => ("error" in j ? setError(j.error) : setEntries(j.entries)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return { entries, error };
}
