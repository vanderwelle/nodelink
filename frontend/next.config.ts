// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import path from "node:path";
import type { NextConfig } from "next";

/** Optional @txnlab/use-wallet peer SDKs for wallets NodeLink does not enable. */
const UNUSED_WALLET_SDKS = [
  "@magic-ext/algorand",
  "magic-sdk",
  "@walletconnect/modal",
  "@walletconnect/sign-client",
  "@web3auth/base",
  "@web3auth/base-provider",
  "@web3auth/modal",
  "@web3auth/single-factor-auth",
] as const;

const EMPTY = "./src/lib/empty-module.ts";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo: include @nodelink/shared (and workspace root) in serverless traces
  outputFileTracingRoot: path.join(__dirname, ".."),
  transpilePackages: ["@nodelink/shared"],
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: Object.fromEntries(UNUSED_WALLET_SDKS.map((m) => [m, EMPTY])),
  },
  webpack: (config: { resolve: { alias: Record<string, string | false> } }) => {
    for (const m of UNUSED_WALLET_SDKS) config.resolve.alias[m] = false;
    return config;
  },
  async redirects() {
    // the old private HUD is now split across the hub tabs
    return [{ source: "/dashboard", destination: "/health", permanent: false }];
  },
  async headers() {
    return [
      {
        // zk artifacts are immutable per build; let browsers cache them
        source: "/zk/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
