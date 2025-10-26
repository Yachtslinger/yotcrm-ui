"use client";

import React from "react";
import type { CampaignData, TemplateId } from "@/lib/campaign/schema";
import { TemplatePicker } from "./TemplatePicker";
import type { BrokerCard } from "./CobrokerSelect";
import { CobrokerSelect } from "./CobrokerSelect";
import { pickHeroImage } from "@/lib/media";

const SPEC_FIELDS: Array<keyof CampaignData["specs"]> = ["length", "beam", "draft", "year", "staterooms", "power", "builder", "model", "location", "price"];
const STORAGE_KEY = "campaign-builder-autosave";

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

  async function handleScrape() {
    if (!listingUrl) return;
    try {
      setScraping(true);
      const res = await fetch("/api/campaign/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: listingUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to scrape");
      onDataChange({ ...data, specs: { ...data.specs, ...json } });
    } catch (err: any) {
      alert(err?.message || "Scrape failed");
    } finally {
      setScraping(false);
    }
  }

  function updateSpec(key: keyof CampaignData["specs"], value: string) {
    onDataChange({ ...data, specs: { ...data.specs, [key]: value } });
  }

  function updateGallery(text: string) {
    const urls = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((src) => ({ src, width: 1200, height: 675, alt: "", tags: [] as string[] }));
    const hero = pickHeroImage(urls.length ? urls : [data.hero]);
    onDataChange({ ...data, hero, gallery: urls });
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
    const rest = data.brokers.filter((b) => b.id !== primaryBroker.id);
    onDataChange({ ...data, brokers: [nextPrimary, ...rest] });
  }

  React.useEffect(() => {
    const rest = data.brokers.filter((b) => b.id !== primaryBroker.id && !cobrokers.some((c) => c.id === b.id));
    onDataChange({ ...data, brokers: [primaryBroker, ...cobrokers, ...rest] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrokers]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <label className="text-sm font-semibold">Listing URL</label>
        <div className="flex gap-2">
          <input
            value={listingUrl}
            onChange={(event) => onListingUrl(event.target.value)}
            placeholder="https://www.denisonyachting.com/yachts-for-sale/..."
            className="flex-1 rounded border px-3 py-2"
          />
          <button type="button" onClick={handleScrape} disabled={!listingUrl || scraping} className="rounded bg-slate-900 px-3 py-2 text-white">
            {scraping ? "Scraping..." : "Scrape"}
          </button>
        </div>
        <p className="text-xs text-slate-500">Autosaved {autosaveNote || "—"}</p>
      </section>

      <section className="space-y-3">
        <label className="text-sm font-semibold">Template</label>
        <TemplatePicker value={templateId} onChange={onTemplateId} />
      </section>

      <section className="space-y-3">
        <label className="text-sm font-semibold">Hero & Gallery</label>
        <input value={data.hero.src} onChange={(e) => onDataChange({ ...data, hero: { ...data.hero, src: e.target.value } })} className="w-full rounded border px-3 py-2" placeholder="Hero image URL" />
        <textarea
          rows={3}
          className="w-full rounded border px-3 py-2"
          placeholder={"Gallery image URLs (one per line)"}
          value={data.gallery.map((asset) => asset.src).join("\n")}
          onChange={(e) => updateGallery(e.target.value)}
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-semibold">Specifications</label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {SPEC_FIELDS.map((field) => (
            <div key={field}>
              <label className="text-xs uppercase text-slate-500">{field}</label>
              <input value={data.specs[field] || ""} onChange={(e) => updateSpec(field, e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <label className="text-sm font-semibold">Primary Broker</label>
        {(["name", "title", "email", "phone", "headshotSrc"] as Array<keyof BrokerCard>).map((key) => (
          <input
            key={key}
            value={primaryBroker[key] || ""}
            onChange={(e) => updatePrimaryBroker(key, e.target.value)}
            placeholder={key === "name" ? "Will Noftsinger" : key}
            className="w-full rounded border px-3 py-2"
          />
        ))}
      </section>

      <section className="space-y-2">
        <label className="text-sm font-semibold">Co-brokers</label>
        <CobrokerSelect myCard={primaryBroker} selected={cobrokers} onChange={onCobrokers} />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-semibold">CTA</label>
        <input value={data.cta.label} onChange={(e) => onDataChange({ ...data, cta: { ...data.cta, label: e.target.value } })} className="w-full rounded border px-3 py-2" placeholder="Book a Tour" />
        <input value={data.cta.href} onChange={(e) => onDataChange({ ...data, cta: { ...data.cta, href: e.target.value } })} className="w-full rounded border px-3 py-2" placeholder="https://..." />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-semibold">Footer</label>
        <textarea value={data.footer.disclaimer} onChange={(e) => onDataChange({ ...data, footer: { ...data.footer, disclaimer: e.target.value } })} className="w-full rounded border px-3 py-2" rows={2} />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-semibold">UTM Tags</label>
        {(["source", "medium", "campaign", "content"] as Array<keyof CampaignData["utm"]>).map((key) => (
          <input key={key} value={data.utm[key]} onChange={(e) => onDataChange({ ...data, utm: { ...data.utm, [key]: e.target.value } })} className="w-full rounded border px-3 py-2" placeholder={`utm_${key}`} />
        ))}
      </section>
    </div>
  );
}
