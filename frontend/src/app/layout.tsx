import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NodeLink — the hub for Algorand node runners",
  description: "Node health, rewards, perks, setup and community for Algorand node runners.",
};

export const viewport: Viewport = { themeColor: "#05070d", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">{children}</main>
          <footer className="border-t border-white/10 py-6 text-center text-xs text-gray-500">
            NodeLink · TestNet preview · dev-only trusted setup — not for production use
          </footer>
        </Providers>
      </body>
    </html>
  );
}
