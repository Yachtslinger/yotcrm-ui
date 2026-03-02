"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // Check if dismissed recently (24h cooldown)
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 86400000) return;

    // Detect iOS Safari
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Show iOS banner after 30s if not installed
    if (isIOSDevice) {
      const timer = setTimeout(() => setShowBanner(true), 30000);
      return () => clearTimeout(timer);
    }

    // Chrome/Edge/Samsung install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after a short delay so user has time to engage
      setTimeout(() => setShowBanner(true), 15000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
  };

  if (isStandalone || !showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up md:left-auto md:right-6 md:max-w-sm">
      <div className="rounded-2xl p-4 flex items-start gap-3"
        style={{
          background: "var(--card, #fff)",
          border: "1px solid var(--border, #e5e5e5)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}>
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(201, 165, 92, 0.12)" }}>
          <Download className="w-5 h-5" style={{ color: "var(--brass-400, #c9a55c)" }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Install YotCRM
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--navy-400, #8899aa)" }}>
            {isIOS
              ? "Tap the Share button, then \"Add to Home Screen\""
              : "Add to your home screen for quick access"}
          </p>

          {/* Install button (non-iOS) */}
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: "var(--brass-400, #c9a55c)",
                color: "var(--navy-950, #0a1628)",
              }}>
              Install
            </button>
          )}
        </div>

        {/* Close */}
        <button onClick={handleDismiss}
          className="shrink-0 p-1 rounded-lg transition-colors hover:bg-black/5"
          aria-label="Dismiss">
          <X className="w-4 h-4" style={{ color: "var(--navy-400, #8899aa)" }} />
        </button>
      </div>
    </div>
  );
}
