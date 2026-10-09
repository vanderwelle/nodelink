// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import type { ReactNode } from "react";
import { HubTabs } from "@/components/hub/HubTabs";

export default function HubSectionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl">
      <HubTabs />
      {children}
    </div>
  );
}
