"use client";
/* eslint-disable @next/next/no-img-element */

import React from "react";
import type { CampaignData, TemplateId, MediaAsset } from "@/lib/campaign/schema";
import { TemplatePicker } from "./TemplatePicker";
import type { BrokerCard } from "./CobrokerSelect";
import { CobrokerSelect } from "./CobrokerSelect";
import { pickHeroImage } from "@/lib/media";

const SPEC_FIELDS: Array<keyof CampaignData["specs"]> = ["length", "beam", "draft", "year", "staterooms", "power", "builder", "model", "location", "price"];
const STORAGE_KEY = "campaign-builder-autosave";
const CLIENT_KEY = process.env.NEXT_PUBLIC_CAMPAIGN_CLIENT_KEY;
const inputClasses =
  "w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-inner shadow-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900/10";

type CampaignScrapePayload = {
  source?: string;
  headline: string | null;
  preheader: string | null;
  hero: string | null;
  gallery: string[];
  specs: CampaignData["specs"];
  price?: string | null;
  location?: string | null;
};

function authHeaders(): Record<string, string> {
  return CLIENT_KEY ? { "x-campaign-key": CLIENT_KEY } : {};
}

function assetFromUrl(src: string, alt = ""): MediaAsset {
  return {
    src,
    width: 1200,
    height: 675,
    alt,
    tags: [],
  };
}

function dedupeAssets(assets: MediaAsset[]): MediaAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.src)) return false;
    seen.add(asset.src);
    return true;
  });
}

type SectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

function SectionCard({ title, description, children }: SectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm shadow-white/70">
      <header className="mb-3 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </header>
      {children}
    </section>
  );
}

type EditorFormProps = {
  templateId: TemplateId;
  onTemplateId: (id: TemplateId) => void;
  cobrokers: BrokerCard[];
  onCobrokers: (cards: BrokerCard[]) => void;
  listingUrl: string;
  onListingUrl: (url: string) => void;
  data: CampaignData;
  onDataChange: (next: CampaignData) => void;
};

export function EditorForm({
  templateId,
  onTemplateId,
  cobrokers,
  onCobrokers,
  listingUrl,
  onListingUrl,
  data,
  onDataChange,
}: EditorFormProps): React.ReactElement {
  const [scraping, setScraping] = React.useState(false);
  const [autosaveNote, setAutosaveNote] = React.useState<string>("");
  const [sendEmail, setSendEmail] = React.useState("");
  const [saveId, setSaveId] = React.useState("");
  const [loadId, setLoadId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [loadingCampaign, setLoadingCampaign] = React.useState(false);
  const [rendering, setRendering] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const restoredRef = React.useRef(false);
  const canScrape = listingUrl.trim().length > 0 && !scraping;

  React.useEffect(() => {
    const payload = JSON.stringify({ listingUrl, data });
    const timeout = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, payload);
      setAutosaveNote(new Date().toLocaleTimeString());
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [listingUrl, data]);

  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  React.useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { listingUrl?: string; data?: CampaignData };
        if (parsed.listingUrl) onListingUrl(parsed.listingUrl);
        if (parsed.data) onDataChange(parsed.data);
      }
    } catch {
      // ignore corrupt cache
    }
  }, [onDataChange, onListingUrl]);

  async function handleScrape() {
    const targetUrl = listingUrl.trim();
    if (!targetUrl) {
      alert("Enter a Denison listing URL first.");
      return;
    }
    try {
      setScraping(true);
      const res = await fetch("/api/campaign/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ url: targetUrl }),
      });
      const json = (await res.json()) as CampaignScrapePayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to scrape");
      const galleryAssets = json.gallery?.length ? dedupeAssets(json.gallery.map((src) => assetFromUrl(src, json.headline || "Gallery"))) : [];
      const heroCandidates = [
        ...(json.hero ? [assetFromUrl(json.hero, json.headline || data.hero.alt || "Hero")] : []),
        ...galleryAssets,
        data.hero,
      ];
      const hero = pickHeroImage(heroCandidates.length ? heroCandidates : [data.hero]);
      const mergedSpecs = { ...data.specs, ...json.specs };
      if (json.location && !mergedSpecs.location) mergedSpecs.location = json.location;
      if (json.price && !mergedSpecs.price) mergedSpecs.price = json.price;
      const nextData: CampaignData = {
        ...data,
        title: json.headline || data.title,
        subtitle: json.preheader || data.subtitle,
        hero,
        gallery: galleryAssets.length ? galleryAssets : data.gallery,
        specs: mergedSpecs,
      };
      if ((!data.cta.href || data.cta.href === "https://denisonyachting.com") && (json.source || listingUrl)) {
        nextData.cta = { ...data.cta, href: json.source || listingUrl };
      }
      onDataChange(nextData);
      if (json.source) {
        onListingUrl(json.source);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scrape failed";
      alert(message);
    } finally {
      setScraping(false);
    }
  }

  function updateSpec(key: keyof CampaignData["specs"], value: string) {
    onDataChange({ ...data, specs: { ...data.specs, [key]: value } });
  }

  function updateGallery(text: string) {
    const bad = /(flag|emoji|icon|badge|logo)/i;
    const urls = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((src) => !bad.test(src))
      .map((src) => ({ src, width: 1200, height: 675, alt: "", tags: [] as string[] }));
    const hero = pickHeroImage(urls.length ? urls : [data.hero]);
    onDataChange({ ...data, hero, gallery: urls });
  }

  function handleGalleryUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) return;
        const next = [...data.gallery, { src, width: 1200, height: 675, alt: file.name, tags: [] as string[] }];
        const hero = pickHeroImage(next);
        onDataChange({ ...data, hero, gallery: next });
      };
      reader.readAsDataURL(file);
    });
  }

  const primaryBroker = data.brokers[0] || {
    id: "me",
    name: "",
    title: "",
    phone: "",
    email: "",
    headshotSrc: "",
  };

  function updatePrimaryBroker<K extends keyof BrokerCard>(key: K, value: BrokerCard[K]) {
    const nextPrimary = { ...primaryBroker, [key]: value };
    const rest = data.brokers.filter((b: BrokerCard) => b.id !== primaryBroker.id);
    onDataChange({ ...data, brokers: [nextPrimary, ...rest] });
  }

  React.useEffect(() => {
    const rest = data.brokers.filter(
      (b: BrokerCard) => b.id !== primaryBroker.id && !cobrokers.some((c) => c.id === b.id)
    );
    onDataChange({ ...data, brokers: [primaryBroker, ...cobrokers, ...rest] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrokers]);

  async function handleRenderCopy() {
    try {
      setRendering(true);
      const res = await fetch("/api/campaign/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Render failed");
      await navigator.clipboard.writeText(json.html);
      alert("Rendered HTML copied to clipboard.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed";
      alert(message);
    } finally {
      setRendering(false);
    }
  }

  async function handleSend(testMode: boolean) {
    if (!sendEmail) {
      alert("Enter a recipient email first.");
      return;
    }
    try {
      setSending(true);
      const res = await fetch("/api/campaign/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ to: sendEmail, testMode, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Send failed");
      alert(`Message queued (${json.messageId})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      alert(message);
    } finally {
      setSending(false);
    }
  }

  async function handleSaveCampaign() {
    try {
      setSaving(true);
      const res = await fetch("/api/campaign/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      setSaveId(json.id);
      await navigator.clipboard.writeText(json.id);
      alert(`Campaign saved (ID copied): ${json.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      alert(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadCampaign() {
    const id = loadId.trim();
    if (!id) {
      alert("Enter a campaign ID to load.");
      return;
    }
    try {
      setLoadingCampaign(true);
      const res = await fetch(`/api/campaign/${id}`, { headers: { ...authHeaders() } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Load failed");
      onTemplateId(json.templateId);
      onDataChange(json);
      onListingUrl(json.hero?.src ? json.hero.src : "");
      alert(`Campaign ${id} loaded.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Load failed";
      alert(message);
    } finally {
      setLoadingCampaign(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Listing link" description="Paste any Denison or MLS URL. We’ll pull the specs and base copy for you.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={listingUrl}
            onChange={(event) => onListingUrl(event.target.value)}
            placeholder="https://www.denisonyachting.com/yachts-for-sale/..."
            className={`${inputClasses} flex-1`}
          />
          <button
            type="button"
            onClick={handleScrape}
            disabled={scraping}
            aria-disabled={!canScrape}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition ${
              canScrape ? "bg-slate-900 hover:bg-slate-800" : "bg-slate-400/80 text-white/80 cursor-not-allowed"
            } ${scraping ? "cursor-wait opacity-70" : ""}`}
          >
            {scraping ? "Scraping..." : "Scrape"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {canScrape ? "Ready to pull specs." : "Paste a Denison listing above to enable scraping."} Autosaved {autosaveNote || "—"}
        </p>
      </SectionCard>

      <SectionCard title="Template & layout" description="Switch templates to explore different hero and body treatments.">
        <TemplatePicker value={templateId} onChange={onTemplateId} />
      </SectionCard>

      <SectionCard title="Hero & gallery" description="Drag images in or paste URLs. We pick a hero for you automatically.">
        <div className="space-y-3">
          <input
            value={data.hero.src}
            onChange={(e) => onDataChange({ ...data, hero: { ...data.hero, src: e.target.value } })}
            className={inputClasses}
            placeholder="Hero image URL"
          />
          <textarea
            rows={3}
            className={inputClasses}
            placeholder="Gallery image URLs (one per line)"
            value={data.gallery.map((asset: typeof data.gallery[number]) => asset.src).join("\n")}
            onChange={(e) => updateGallery(e.target.value)}
          />
          <label className="block cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            Upload images
            <input type="file" accept="image/*" multiple onChange={(e) => handleGalleryUpload(e.target.files)} className="mt-1 w-full text-xs" />
          </label>
          {data.gallery.length > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {data.gallery.map((asset, idx) => (
                <img key={`${asset.src}-${idx}`} src={asset.src} alt={asset.alt || ""} className="h-20 w-full rounded-lg object-cover shadow" />
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Specifications" description="Scraped specs land here first. Adjust anything before rendering.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {SPEC_FIELDS.map((field) => (
            <label key={String(field)} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {String(field)}
              <input value={data.specs[field] || ""} onChange={(e) => updateSpec(field, e.target.value)} className={`${inputClasses} mt-1`} />
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Brokerage" description="Primary broker details power the first card. Add co-brokers to fill the remaining spots.">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["name", "title", "email", "phone", "headshotSrc"] as Array<keyof BrokerCard>).map((key) => (
              <input
                key={String(key)}
                value={primaryBroker[key] || ""}
                onChange={(e) => updatePrimaryBroker(key, e.target.value)}
                placeholder={key === "name" ? "Will Noftsinger" : String(key)}
                className={inputClasses}
              />
            ))}
          </div>
          <CobrokerSelect myCard={primaryBroker} selected={cobrokers} onChange={onCobrokers} />
        </div>
      </SectionCard>

      <SectionCard title="Messaging" description="Buttons, footer copy, and tracking tags keep campaigns on-brand.">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={data.cta.label}
              onChange={(e) => onDataChange({ ...data, cta: { ...data.cta, label: e.target.value } })}
              className={inputClasses}
              placeholder="Call to action label"
            />
            <input
              value={data.cta.href}
              onChange={(e) => onDataChange({ ...data, cta: { ...data.cta, href: e.target.value } })}
              className={inputClasses}
              placeholder="https://denisonyachting.com/..."
            />
          </div>
          <textarea
            value={data.footer.disclaimer}
            onChange={(e) => onDataChange({ ...data, footer: { ...data.footer, disclaimer: e.target.value } })}
            className={inputClasses}
            rows={2}
            placeholder="Footer / compliance copy"
          />
          <div className="grid gap-3 md:grid-cols-2">
            {(["source", "medium", "campaign", "content"] as Array<keyof CampaignData["utm"]>).map((key) => (
              <input
                key={String(key)}
                value={data.utm[key]}
                onChange={(e) => onDataChange({ ...data, utm: { ...data.utm, [key]: e.target.value } })}
                className={inputClasses}
                placeholder={`utm_${String(key)}`}
              />
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Delivery" description="Save work, reload older drafts, or push a render/test send.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveCampaign}
              disabled={saving}
              className="rounded-xl border border-slate-900/20 bg-white px-4 py-2 text-sm font-semibold shadow-sm shadow-slate-900/10 transition hover:border-slate-900/40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save campaign"}
            </button>
            {saveId && <span className="text-xs text-slate-500">Last saved ID: {saveId}</span>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={loadId} onChange={(e) => setLoadId(e.target.value)} className={`${inputClasses} flex-1`} placeholder="Campaign ID" />
            <button
              type="button"
              onClick={handleLoadCampaign}
              disabled={loadingCampaign}
              className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed"
            >
              {loadingCampaign ? "Loading..." : "Load"}
            </button>
          </div>
          <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white/90 p-3">
            <input value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} className={inputClasses} placeholder="test@example.com" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRenderCopy}
                disabled={rendering}
                className="rounded-xl border border-slate-900/20 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition hover:bg-slate-800 disabled:cursor-not-allowed"
              >
                {rendering ? "Rendering..." : "Render + copy HTML"}
              </button>
              <button
                type="button"
                onClick={() => handleSend(true)}
                disabled={sending}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed"
              >
                {sending ? "Sending..." : "Send test email"}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
