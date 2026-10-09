// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { BookOpen, ExternalLink } from "lucide-react";
import { NODEKIT_SOURCES, type NodekitSource } from "@/content/nodekit";

export function SourceLink({ source }: { source: NodekitSource }) {
  const s = NODEKIT_SOURCES[source];
  return (
    <a className="inline-flex items-center gap-1 text-xs text-accent hover:underline" href={s.url} target="_blank" rel="noreferrer">
      <BookOpen className="h-3 w-3 shrink-0" /> {s.label} <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export function SourceList({ sources }: { sources: readonly NodekitSource[] }) {
  return (
    <ul className="space-y-1.5">
      {sources.map((s) => (
        <li key={s}>
          <SourceLink source={s} />
        </li>
      ))}
    </ul>
  );
}
