import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["better-sqlite3", "googleapis"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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
