import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["better-sqlite3", "googleapis", "puppeteer", "puppeteer-extra", "puppeteer-extra-plugin-stealth", "clone-deep", "merge-deep"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Allow larger request bodies for the sync endpoint (leads table ~2MB+)
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  webpack: (config: { externals: unknown[]; resolve?: { fallback?: Record<string,unknown> } }, { isServer }: { isServer: boolean }) => {
    config.externals = config.externals || [];
    // googleapis is optional — only used when Gmail OAuth is configured.
    config.externals.push("googleapis");
    // Prevent native Node modules from being bundled into the client build.
    // better-sqlite3 uses fs/path bindings that webpack cannot resolve client-side.
    if (!isServer) {
      config.externals.push("better-sqlite3");
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false, path: false, crypto: false, os: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
