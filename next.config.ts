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
  webpack: (config: { externals: unknown[] }) => {
    // googleapis is optional — only used when Gmail OAuth is configured.
    // Prevent webpack from failing the build when it's not installed.
    config.externals = config.externals || [];
    config.externals.push("googleapis");
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
