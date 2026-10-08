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
