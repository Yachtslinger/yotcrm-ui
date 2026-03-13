import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Digital Business Card",
};

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Google Fonts — Playfair Display + DM Sans */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <div style={{ minHeight: "100dvh", background: "#f0f0f0" }}>
        {children}
      </div>
    </>
  );
}
