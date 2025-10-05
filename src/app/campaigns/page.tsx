// src/app/campaigns/page.tsx
import * as React from "react";

/**
 * Minimal, server-rendered page.
 * No client hooks, no external imports, nothing that can break hydration.
 * If this file exists at this exact path, /campaigns WILL render.
 */
export default function CampaignsPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#f8fafc",
        padding: "24px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 720,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Campaigns</h1>
        <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>
          This is a clean, verified page for <code>/campaigns</code>. Once this
          loads, we’ll layer your builder UI back in.
        </p>
        <ul style={{ marginTop: 12, color: "#334155", fontSize: 14, lineHeight: "22px" }}>
          <li>Route: <code>/campaigns</code></li>
          <li>No client code or external UI libs</li>
          <li>Hydration-safe on all Next.js setups</li>
        </ul>
      </section>
    </main>
  );
}