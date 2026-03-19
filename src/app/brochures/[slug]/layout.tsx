// src/app/brochures/[slug]/layout.tsx
// Opts out of the root NavShell so the brochure renders as a standalone page.
// The brochure HTML template has its own <nav>, fonts, and full-page styles —
// rendering inside YotCRM's app shell breaks everything.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "E-Brochure",
};

export default function BrochureSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Render children directly — no NavShell, no YotCRM chrome, no global styles.
  // The brochure template is fully self-contained.
  return <>{children}</>;
}
