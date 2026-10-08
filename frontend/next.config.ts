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
  transpilePackages: ["@nodelink/shared"],
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: Object.fromEntries(UNUSED_WALLET_SDKS.map((m) => [m, EMPTY])),
  },
  webpack: (config: { resolve: { alias: Record<string, string | false> } }) => {
    for (const m of UNUSED_WALLET_SDKS) config.resolve.alias[m] = false;
    return config;
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
