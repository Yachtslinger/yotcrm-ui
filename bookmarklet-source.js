/**
 * YotCRM Bookmarklet — source file
 *
 * This is the readable version. The minified one-liner below is what
 * actually goes into the browser bookmark.
 *
 * How it works:
 *  1. Extracts window.__REDUX_STATE__ (YachtWorld), JSON-LD, meta tags,
 *     and visible images from whatever listing page you're on
 *  2. POSTs them to /api/brochures/ingest
 *  3. Stores vessel data in sessionStorage
 *  4. Opens /brochures?ingest=1 — the brochure editor reads from sessionStorage
 *     and pre-fills everything
 *
 * Supports: YachtWorld, Boat International, Superyacht Times, Denison,
 *           and any site with JSON-LD / og: meta tags
 */

(function () {
  const BASE = "https://yotcrm-production.up.railway.app";

  // Show a small status overlay so you know it's working
  const overlay = document.createElement("div");
  overlay.id = "__yotcrm_overlay";
  overlay.style.cssText = [
    "position:fixed;top:20px;right:20px;z-index:999999",
    "background:#0f1b2d;color:#d4af60;font:600 14px/1 system-ui",
    "padding:14px 20px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.5)",
    "border:1px solid rgba(212,175,96,.4);min-width:220px;text-align:center",
  ].join(";");
  overlay.textContent = "⚓ YotCRM — Reading page…";
  document.body.appendChild(overlay);

  function setStatus(msg) { overlay.textContent = msg; }
  function dismiss() { overlay.remove(); }

  // 1. Collect __REDUX_STATE__ (YachtWorld)
  let reduxState = null;
  try { reduxState = window.__REDUX_STATE__ || null; } catch (_) {}

  // 2. Collect JSON-LD blocks
  const jsonLd = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
    try {
      const parsed = JSON.parse(el.textContent || "");
      const nodes = Array.isArray(parsed) ? parsed
        : parsed["@graph"] ? parsed["@graph"] : [parsed];
      nodes.forEach(n => n && jsonLd.push(n));
    } catch (_) {}
  });

  // 3. Collect meta tags
  const metaTags = {};
  document.querySelectorAll("meta[property],meta[name]").forEach(el => {
    const key = el.getAttribute("property") || el.getAttribute("name") || "";
    const val = el.getAttribute("content") || "";
    if (key && val) metaTags[key] = val;
  });

  // 4. Visible images as last-resort fallback
  const images = [];
  document.querySelectorAll("img[src]").forEach(img => {
    const src = img.src || "";
    if (src.startsWith("http") && img.naturalWidth > 200 &&
        !/logo|icon|sprite|avatar|favicon/i.test(src))
      images.push(src);
  });

  setStatus("⚓ YotCRM — Sending to CRM…");

  fetch(BASE + "/api/brochures/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageUrl: window.location.href,
      reduxState,
      metaTags,
      jsonLd,
      images: images.slice(0, 50),
      title: document.title,
    }),
    credentials: "include",
  })
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.vessel) throw new Error(data.error || "Ingest failed");
      // Store vessel in sessionStorage so the brochure page can read it
      sessionStorage.setItem("__yotcrm_ingest", JSON.stringify(data.vessel));
      setStatus("✅ Opening brochure editor…");
      setTimeout(() => {
        dismiss();
        window.open(BASE + "/brochures?ingest=1", "_blank");
      }, 600);
    })
    .catch(err => {
      setStatus("❌ " + (err.message || "Error — are you logged in to YotCRM?"));
      setTimeout(dismiss, 4000);
    });
})();
