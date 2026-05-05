// src/lib/brochure-template.ts
// Generates a complete, self-contained luxury brochure HTML string.
// Navy/gold aesthetic matching the Ocean King Explorer 34M brochure.

import type { VesselData, BrokerInfo } from "@/lib/brochure-storage";
import { formatCapacity } from "@/lib/capacity-utils";

function esc(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function specRow(key: string, val: string | null | undefined): string {
  if (!val) return "";
  return `<div class="spec-row"><div class="spec-key">${esc(key)}</div><div class="spec-val">${esc(val)}</div></div>`;
}

export function generateBrochureHTML(vessel: VesselData, brokers: BrokerInfo[]): string {
  const heroImg   = vessel.images?.[0]?.src || "";
  const intro2Img = vessel.images?.[1]?.src || "";

  // Split images by category tag; fall back to index-based slicing for untagged sets
  const hasCategories = vessel.images.some(i => (i as any).category);
  const extImages  = hasCategories
    ? vessel.images.filter(i => (i as any).category === "exterior" || (i as any).category === "")
    : vessel.images.slice(0, 8);
  const intImages  = hasCategories
    ? vessel.images.filter(i => (i as any).category === "interior")
    : vessel.images.slice(8, 24);
  const techImages = hasCategories
    ? vessel.images.filter(i => (i as any).category === "technical")
    : vessel.images.slice(24, 32);
  const gaImages   = (vessel as any).gaImages as { src: string; alt: string }[] | undefined || [];
  const videos     = (vessel as any).videos   as { url: string; thumbnail?: string; title?: string; type: string }[] | undefined || [];

  const galleryData = {
    ext:  extImages.map((img, i)  => ({ src: img.src, cap: img.alt || `Exterior ${i + 1}` })),
    int:  intImages.map((img, i)  => ({ src: img.src, cap: img.alt || `Interior ${i + 1}` })),
    tech: techImages.map((img, i) => ({ src: img.src, cap: img.alt || `Technical ${i + 1}` })),
  };

  const customIntro = (vessel as any).customIntro as string | undefined;
  const customFields = (vessel as any).customFields as { key: string; value: string }[] | undefined || [];

  const descHtml = vessel.description
    ? vessel.description.split("\n\n").filter(p => p.trim()).slice(0, 4)
        .map(p => `<p class="section-body reveal">${esc(p.trim())}</p>`).join("")
    : `<p class="section-body reveal">${esc(vessel.name)} — a distinguished motor yacht combining advanced naval engineering with refined luxury.</p>`;

  const brokerCards = brokers.map(b => `
    <div class="broker-card">
      ${b.photo ? `<div class="broker-photo-wrap"><img src="${esc(b.photo)}" alt="${esc(b.name)}" class="broker-photo" /></div>` : ""}
      <div class="broker-name">${esc(b.name)}</div>
      ${b.title ? `<div class="broker-title">${esc(b.title)}</div>` : ""}
      <div class="broker-row"><span class="broker-key">Email</span><span class="broker-val"><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></span></div>
      <div class="broker-row"><span class="broker-key">Cell / WhatsApp</span><span class="broker-val"><a href="https://wa.me/${b.mobile.replace(/\D/g, "")}">${esc(b.mobile)}</a></span></div>
      ${b.office ? `<div class="broker-row"><span class="broker-key">Office</span><span class="broker-val">${esc(b.office)}</span></div>` : ""}
      ${b.instagram ? `<div class="broker-row"><span class="broker-key">Instagram</span><span class="broker-val"><a href="https://instagram.com/${b.instagram.replace("@","")}">${esc(b.instagram)}</a></span></div>` : ""}
    </div>`).join("");

  const galleryTabs = [
    extImages.length  ? { id: "ext",  label: "Exterior" }  : null,
    intImages.length  ? { id: "int",  label: "Interior" }  : null,
    techImages.length ? { id: "tech", label: "Technical" } : null,
  ].filter(Boolean) as { id: string; label: string }[];

  const buildTab = (id: string, images: { src: string; alt: string }[], firstLabel: string) => {
    if (!images.length) return "";
    const thumbs = images.map((img, i) => `
      <div class="thumb${i === 0 ? " active" : ""}" onclick="setMain('${id}',${i})">
        <img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy">
      </div>`).join("");
    return `
      <div class="tab-panel${id === "ext" ? " active" : ""}" id="tab-${id}">
        <div class="gallery-main" onclick="openLightbox('${id}',0)">
          <img id="${id}-main" src="${esc(images[0].src)}" alt="${esc(firstLabel)}">
          <div class="gallery-caption" id="${id}-cap">${esc(firstLabel)}</div>
        </div>
        <div class="gallery-thumbs">${thumbs}</div>
      </div>`;
  };

  const heroStats = [
    vessel.loa          ? { label: "Length Overall", value: vessel.loa.split("/")[0].trim(), unit: vessel.loa.includes("/") ? vessel.loa.split("/")[1].trim() : "" } : null,
    vessel.range        ? { label: "Range", value: vessel.range.replace(/nm|nautical miles/gi, "").trim(), unit: "nautical miles" } : null,
    vessel.guests       ? { label: "Accommodation", value: vessel.guests, unit: vessel.staterooms ? `in ${vessel.staterooms} staterooms` : "guests" } : null,
    vessel.maxSpeed     ? { label: "Max Speed", value: vessel.maxSpeed.replace(/kn|knots/gi, "").trim(), unit: "knots" } : null,
    vessel.grossTonnage ? { label: "Gross Tonnage", value: vessel.grossTonnage, unit: vessel.classification || "" } : null,
  ].filter(Boolean) as { label: string; value: string; unit: string }[];

  const perfItems = [
    vessel.maxSpeed     ? { num: vessel.maxSpeed.replace(/kn|knots/gi, "").trim(), suf: "kn", label: "Maximum Speed", sub: vessel.cruiseSpeed ? vessel.cruiseSpeed + " cruise" : "" } : null,
    vessel.range        ? { num: vessel.range.replace(/nm|nautical miles/gi, "").trim(), suf: "", label: "Nautical Mile Range", sub: vessel.fuelTank || "" } : null,
    vessel.displacement ? { num: vessel.displacement.replace(/metric tons|tonnes/gi, "").replace(/t$/i, "").trim(), suf: "T", label: "Displacement", sub: vessel.grossTonnage || "" } : null,
    vessel.power        ? { num: vessel.power.replace(/hp|bhp|kW/gi, "").replace(/\s*×\s*[\d,]+/, "").trim(), suf: "hp", label: "Total Power", sub: (vessel.engines || "").substring(0, 40) } : null,
  ].filter(Boolean) as { num: string; suf: string; label: string; sub: string }[];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(vessel.name)} — ${esc(vessel.builder || "Luxury Motor Yacht")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Cinzel:wght@400;500;600&family=Raleway:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{--navy-deep:#050d1a;--navy-mid:#091628;--navy-light:#0f2040;--navy-panel:#0a1b30;--gold-warm:#b8933a;--gold-bright:#d4af60;--gold-pale:#e8cc88;--cream:#f5efe6;--cream-dim:#ddd5c8;--white:#ffffff;--muted:#7a8fa8;--divider:rgba(184,147,58,.25);}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{background:var(--navy-deep);color:var(--cream);font-family:'Raleway',sans-serif;font-weight:300;font-size:15px;line-height:1.75;overflow-x:hidden;}
::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:var(--navy-deep);}::-webkit-scrollbar-thumb{background:var(--gold-warm);border-radius:3px;}
nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 60px;height:68px;background:rgba(5,13,26,.9);backdrop-filter:blur(14px);border-bottom:1px solid var(--divider);}
.nav-brand{font-family:'Cinzel',serif;font-size:12px;letter-spacing:.22em;color:var(--gold-warm);text-decoration:none;text-transform:uppercase;}
.nav-links{display:flex;gap:36px;list-style:none;}
.nav-links a{font-family:'Cinzel',serif;font-size:10px;letter-spacing:.18em;color:var(--cream-dim);text-decoration:none;text-transform:uppercase;transition:color .25s;}
.nav-links a:hover{color:var(--gold-bright);}
.hero{position:relative;height:100vh;min-height:680px;display:flex;overflow:hidden;}
.hero-bg{position:absolute;inset:0;overflow:hidden;}
.hero-bg img{width:100%;height:100%;object-fit:cover;object-position:center 40%;animation:heroZoom 18s ease-out forwards;}
@keyframes heroZoom{from{transform:scale(1.08);}to{transform:scale(1);}}
.hero-overlay{position:absolute;inset:0;background:linear-gradient(105deg,rgba(5,13,26,.75) 0%,rgba(5,13,26,.42) 50%,rgba(5,13,26,.65) 100%);}
.hero-content{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:flex-end;padding:0 0 80px 80px;flex:1;}
.hero-eyebrow{font-family:'Cinzel',serif;font-size:14px;letter-spacing:.22em;color:var(--gold-warm);text-transform:uppercase;margin-bottom:18px;animation:fadeUp .9s .3s both;}
.hero-title{font-family:'Cormorant Garamond',serif;font-size:clamp(56px,8vw,106px);font-weight:300;line-height:.92;color:var(--white);animation:fadeUp .9s .5s both;}
.hero-title em{font-style:italic;color:var(--gold-pale);}
.hero-subtitle{margin-top:24px;font-family:'Cinzel',serif;font-size:15px;letter-spacing:.18em;color:var(--cream-dim);text-transform:uppercase;animation:fadeUp .9s .7s both;}
.hero-scroll{margin-top:48px;display:flex;align-items:center;gap:14px;animation:fadeUp .9s .9s both;}
.scroll-line{width:48px;height:1px;background:var(--gold-warm);}
.scroll-label{font-family:'Cinzel',serif;font-size:13px;letter-spacing:.18em;color:var(--gold-warm);text-transform:uppercase;}
.hero-stats{position:relative;z-index:2;width:255px;background:rgba(9,22,40,.85);backdrop-filter:blur(10px);border-left:1px solid var(--divider);display:flex;flex-direction:column;justify-content:center;padding:48px 34px;animation:fadeIn 1.1s .4s both;}
.stat-item{padding:18px 0;border-bottom:1px solid var(--divider);}
.stat-item:last-child{border-bottom:none;}
.stat-label{font-family:'Cinzel',serif;font-size:8.5px;letter-spacing:.2em;color:var(--gold-warm);text-transform:uppercase;margin-bottom:5px;}
.stat-value{font-family:'Cormorant Garamond',serif;font-size:25px;font-weight:400;color:var(--white);line-height:1;}
.stat-unit{font-size:11px;font-weight:300;color:var(--cream-dim);margin-top:3px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(28px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
section{padding:100px 0;}
.container{max-width:1240px;margin:0 auto;padding:0 60px;}
.section-eyebrow{font-family:'Cinzel',serif;font-size:9.5px;letter-spacing:.28em;color:var(--gold-warm);text-transform:uppercase;margin-bottom:18px;}
.section-title{font-family:'Cormorant Garamond',serif;font-size:clamp(38px,5vw,58px);font-weight:300;line-height:1.1;color:var(--white);margin-bottom:26px;}
.section-title em{font-style:italic;color:var(--gold-pale);}
.section-body{font-size:15px;font-weight:300;line-height:1.85;color:var(--cream-dim);max-width:680px;margin-top:18px;}
.gold-rule{width:56px;height:1px;background:var(--gold-warm);margin-bottom:36px;}
.intro{background:var(--navy-mid);}
.intro-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start;}
.intro-right{padding-top:60px;}
.intro-image{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;}
.intro-image-caption{margin-top:14px;font-size:11.5px;color:var(--muted);font-style:italic;}
.design-credits{margin-top:44px;border-top:1px solid var(--divider);padding-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:20px 32px;}
.credit-role{font-family:'Cinzel',serif;font-size:8.5px;letter-spacing:.2em;color:var(--gold-warm);text-transform:uppercase;margin-bottom:5px;}
.credit-name{font-size:14px;font-weight:400;color:var(--cream);}
.gallery{background:var(--navy-mid);}
.gallery-tabs{display:flex;border-bottom:1px solid var(--divider);margin-bottom:36px;margin-top:44px;}
.tab-btn{font-family:'Cinzel',serif;font-size:10px;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;padding:13px 20px;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;transition:all .25s;position:relative;bottom:-1px;}
.tab-btn.active{color:var(--gold-bright);border-bottom-color:var(--gold-warm);}
.tab-panel{display:none;}.tab-panel.active{display:block;}
.gallery-main{position:relative;overflow:hidden;background:var(--navy-deep);aspect-ratio:16/9;cursor:zoom-in;max-height:72vh;}
.gallery-main img{width:100%;height:100%;object-fit:cover;transition:transform .45s ease;}
.gallery-main:hover img{transform:scale(1.015);}
.gallery-caption{position:absolute;bottom:0;left:0;right:0;padding:22px 26px 18px;background:linear-gradient(transparent,rgba(5,13,26,.7));font-family:'Cinzel',serif;font-size:9px;letter-spacing:.16em;color:var(--gold-pale);text-transform:uppercase;}
.gallery-thumbs{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-top:6px;}
.thumb{aspect-ratio:16/10;overflow:hidden;cursor:pointer;opacity:.45;transition:opacity .2s,transform .2s;background:var(--navy-deep);}
.thumb.active,.thumb:hover{opacity:1;transform:scale(1.02);}
.thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.ga-section{background:var(--navy-deep);border-top:1px solid var(--divider);border-bottom:1px solid var(--divider);}
.ga-img-wrap{margin-bottom:24px;background:#fff;border:1px solid var(--divider);}
.ga-img-wrap img{width:100%;display:block;object-fit:contain;max-height:700px;}
.ga-img-caption{padding:12px 20px;font-family:'Cinzel',serif;font-size:9px;letter-spacing:.16em;color:var(--gold-warm);text-transform:uppercase;border-top:1px solid var(--divider);}
.videos-section{background:var(--navy-mid,#0a1628);border-top:1px solid var(--divider);}
.videos-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:32px;}
@media(max-width:600px){.videos-grid{grid-template-columns:1fr;}}
.video-item{}
.video-embed-wrap{position:relative;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;border:1px solid var(--divider);}
.video-embed-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none;}
.video-caption{padding:10px 0;font-family:'Cinzel',serif;font-size:9px;letter-spacing:.16em;color:var(--gold-warm);text-transform:uppercase;}
.lightbox{display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.96);align-items:center;justify-content:center;flex-direction:column;gap:16px;}
.lightbox.open{display:flex;}
.lightbox img{max-width:92vw;max-height:88vh;object-fit:contain;border:1px solid var(--divider);}
.lb-controls{display:flex;gap:32px;}
.lb-btn{font-family:'Cinzel',serif;font-size:10px;letter-spacing:.16em;color:var(--gold-warm);background:none;border:1px solid var(--divider);padding:8px 18px;cursor:pointer;text-transform:uppercase;}
.lb-close{position:absolute;top:22px;right:28px;font-family:'Cinzel',serif;font-size:11px;letter-spacing:.15em;color:var(--gold-warm);background:none;border:none;cursor:pointer;text-transform:uppercase;}
.perf-banner{background:var(--navy-deep);border-top:1px solid var(--divider);border-bottom:1px solid var(--divider);}
.perf-grid{display:grid;grid-template-columns:repeat(4,1fr);}
.perf-item{padding:50px 36px;border-right:1px solid var(--divider);text-align:center;}
.perf-item:last-child{border-right:none;}
.perf-number{font-family:'Cormorant Garamond',serif;font-size:62px;font-weight:300;color:var(--white);line-height:1;}
.perf-number sup{font-size:24px;color:var(--gold-warm);vertical-align:super;}
.perf-label{font-family:'Cinzel',serif;font-size:8.5px;letter-spacing:.2em;color:var(--gold-warm);text-transform:uppercase;margin-top:10px;}
.perf-sub{font-size:11.5px;font-weight:300;color:var(--muted);margin-top:6px;}
.specs{background:var(--navy-mid);}
.specs-table{display:grid;grid-template-columns:1fr 1fr;gap:2px;border:1px solid var(--divider);}
.spec-row{display:grid;grid-template-columns:200px 1fr;padding:15px 26px;background:var(--navy-panel);border-bottom:1px solid rgba(255,255,255,.04);}
.spec-row:nth-child(even){background:var(--navy-deep);}
.spec-key{font-family:'Cinzel',serif;font-size:9px;letter-spacing:.15em;color:var(--gold-warm);text-transform:uppercase;line-height:1.6;}
.spec-val{font-size:13.5px;font-weight:400;color:var(--cream);line-height:1.6;hyphens:none;}
.spec-header{grid-column:1/-1;background:var(--navy-deep)!important;padding:14px 26px;font-family:'Cinzel',serif;font-size:11px;letter-spacing:.2em;color:var(--gold-bright);text-transform:uppercase;border-top:2px solid var(--divider);font-weight:700;}
.contact{background:var(--navy-deep);position:relative;overflow:hidden;}
.contact::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(184,147,58,.07) 0%,transparent 65%);pointer-events:none;}
.contact-inner{position:relative;text-align:center;}
.contact-lead{font-size:16px;font-weight:300;color:var(--cream-dim);max-width:580px;margin:0 auto 52px;line-height:1.8;}
.brokers-row{display:flex;justify-content:center;gap:44px;flex-wrap:wrap;}
.broker-card{background:var(--navy-panel);border:1px solid var(--divider);padding:36px 40px;min-width:260px;transition:border-color .25s;}
.broker-card:hover{border-color:var(--gold-warm);}
.broker-photo-wrap{margin-bottom:18px;}
.broker-photo{width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--gold-warm);display:block;}
.broker-name{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:var(--white);margin-bottom:4px;}
.broker-title{font-size:10px;color:var(--muted);letter-spacing:.06em;margin-bottom:14px;}
.broker-row{display:flex;gap:10px;align-items:baseline;margin-bottom:9px;}
.broker-key{font-family:'Cinzel',serif;font-size:8px;letter-spacing:.18em;color:var(--gold-warm);text-transform:uppercase;flex-shrink:0;white-space:nowrap;}
.broker-val{font-size:13px;font-weight:300;color:var(--cream-dim);}
.broker-val a{color:var(--cream-dim);text-decoration:none;transition:color .25s;}
.broker-val a:hover{color:var(--gold-bright);}
footer{background:var(--navy-deep);border-top:1px solid var(--divider);padding:32px 60px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
.footer-brand{font-family:'Cinzel',serif;font-size:12px;letter-spacing:.22em;color:var(--gold-warm);text-transform:uppercase;}
.footer-note{font-size:12px;font-weight:300;color:var(--muted);}
.reveal{opacity:0;transform:translateY(30px);transition:opacity .7s ease,transform .7s ease;}
.reveal.visible{opacity:1;transform:translateY(0);}
.custom-intro{background:var(--navy-deep);border-bottom:1px solid var(--divider);}
.custom-intro-inner{max-width:860px;margin:0 auto;padding:80px 60px;}
.custom-intro-text{font-family:'Cormorant Garamond',serif;font-size:clamp(18px,2.2vw,24px);font-weight:300;line-height:1.75;color:var(--cream);white-space:pre-wrap;}
.custom-fields-table{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:2px;border:1px solid var(--divider);}
@media(max-width:960px){nav{padding:0 24px;}.nav-links{display:none;}.hero-content{padding:0 0 56px 32px;}.hero-stats{display:none;}.container{padding:0 26px;}section{padding:72px 0;}.intro-grid{grid-template-columns:1fr;gap:36px;}.specs-table{grid-template-columns:1fr;}.perf-grid{grid-template-columns:1fr 1fr;}.gallery-thumbs{grid-template-columns:repeat(3,1fr);}.brokers-row{gap:20px;}footer{padding:24px 26px;}}
</style>
</head>
<body>
<nav>
  <a class="nav-brand" href="#">${esc(vessel.name)} · ${esc(vessel.builder || "")}</a>
  <ul class="nav-links">
    <li><a href="javascript:void(0)" onclick="window.history.length>1&&document.referrer?window.history.back():window.location.href='/brochures'" style="opacity:.6;font-size:9px;">← Back</a></li>
    <li><button onclick="if(navigator.share){navigator.share({title:document.title,url:window.location.href}).catch(function(){});}else{navigator.clipboard&&navigator.clipboard.writeText(window.location.href).then(function(){alert('Link copied!');});}" style="font-family:Cinzel,serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-warm);background:rgba(184,147,58,.12);border:1px solid rgba(184,147,58,.3);padding:7px 16px;cursor:pointer;border-radius:0;display:flex;align-items:center;gap:7px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>Share</button></li>
    <li><a href="#intro">Overview</a></li>
    <li><a href="#gallery">Gallery</a></li>
    ${gaImages.length > 0 ? `<li><a href="#arrangements">Arrangements</a></li>` : ""}
    ${videos.length > 0 ? `<li><a href="#videos">Videos</a></li>` : ""}
    <li><a href="#specifications">Specifications</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</nav>
<section class="hero">
  <div class="hero-bg"><img src="${esc(heroImg)}" alt="${esc(vessel.name)}"></div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <p class="hero-eyebrow">${esc(vessel.builder || "")}${vessel.year ? ` · ${vessel.year} Delivery` : ""}</p>
    <h1 class="hero-title"><em>${esc(vessel.name)}</em></h1>
    <p class="hero-subtitle">${[vessel.loa, vessel.hullMaterial, vessel.hullForm].filter(Boolean).join(" · ")}</p>
    <div class="hero-scroll"><div class="scroll-line"></div><span class="scroll-label">Discover the Vessel</span></div>
  </div>
  <div class="hero-stats">
    ${heroStats.map(s => `<div class="stat-item"><div class="stat-label">${esc(s.label)}</div><div class="stat-value">${esc(s.value)}</div>${s.unit ? `<div class="stat-unit">${esc(s.unit)}</div>` : ""}</div>`).join("")}
  </div>
</section>
${customIntro || customFields.length > 0 ? `
<section class="custom-intro">
  <div class="custom-intro-inner">
    ${customIntro ? `<p class="custom-intro-text reveal">${esc(customIntro)}</p>` : ""}
    ${customFields.length > 0 ? `
    <div class="custom-fields-table reveal" style="margin-top:${customIntro ? "48px" : "0"}">
      ${customFields.filter(f => f.key && f.value).map(f => `
      <div class="spec-row"><div class="spec-key">${esc(f.key)}</div><div class="spec-val">${esc(f.value)}</div></div>`).join("")}
    </div>` : ""}
  </div>
</section>` : ""}
<section class="intro" id="intro">
  <div class="container">
    <div class="intro-grid">
      <div>
        <p class="section-eyebrow reveal">Overview</p>
        <div class="gold-rule reveal"></div>
        <h2 class="section-title reveal">${esc(vessel.name)}<br><em>${esc(vessel.builder || "Luxury Motor Yacht")}</em></h2>
        ${descHtml}
        ${vessel.exteriorDesign || vessel.interiorDesign || vessel.navalArchitect || vessel.stockNumber ? `
        <div class="design-credits reveal">
          ${vessel.exteriorDesign  ? `<div><div class="credit-role">Exterior Design</div><div class="credit-name">${esc(vessel.exteriorDesign)}</div></div>` : ""}
          ${vessel.interiorDesign  ? `<div><div class="credit-role">Interior Design</div><div class="credit-name">${esc(vessel.interiorDesign)}</div></div>` : ""}
          ${vessel.navalArchitect  ? `<div><div class="credit-role">Naval Architecture</div><div class="credit-name">${esc(vessel.navalArchitect)}</div></div>` : ""}
          ${vessel.classification  ? `<div><div class="credit-role">Classification</div><div class="credit-name">${esc(vessel.classification)}</div></div>` : ""}
          ${vessel.stockNumber     ? `<div><div class="credit-role">Stock Number</div><div class="credit-name">${esc(vessel.stockNumber)}</div></div>` : ""}
        </div>` : ""}
      </div>
      <div class="reveal">
        ${intro2Img ? `<img class="intro-image" src="${esc(intro2Img)}" alt="${esc(vessel.name)}">` : ""}
        <p class="intro-image-caption">${esc(vessel.builder || "")} · ${esc(vessel.location || "Available Worldwide")}</p>
      </div>
    </div>
  </div>
</section>
<section class="gallery" id="gallery">
  <div class="container">
    <p class="section-eyebrow reveal">Photo Gallery</p>
    <div class="gold-rule reveal"></div>
    <h2 class="section-title reveal">A Vessel Designed to <em>Impress</em></h2>
    <div class="gallery-tabs">
      ${galleryTabs.map((t, i) => `<button class="tab-btn${i === 0 ? " active" : ""}" onclick="switchTab(event,'${t.id}')">${esc(t.label)}</button>`).join("")}
    </div>
    ${buildTab("ext", extImages, `${vessel.name} — ${vessel.builder || ""}`)}
    ${buildTab("int", intImages, `${vessel.name} — Interior`)}
    ${buildTab("tech", techImages, `${vessel.name} — Technical Spaces`)}
  </div>
</section>
<div class="lightbox" id="lightbox">
  <button class="lb-close" onclick="closeLightbox()">Close ✕</button>
  <img id="lb-img" src="" alt="">
  <div class="lb-controls">
    <button class="lb-btn" onclick="lbNav(-1)">← Prev</button>
    <button class="lb-btn" onclick="lbNav(1)">Next →</button>
  </div>
</div>
${gaImages.length > 0 ? `
<section class="ga-section" id="arrangements">
  <div class="container" style="padding-top:80px;padding-bottom:80px;">
    <p class="section-eyebrow reveal">Deck Plans &amp; Layout</p>
    <div class="gold-rule reveal"></div>
    <h2 class="section-title reveal" style="margin-bottom:52px;">General <em>Arrangements</em></h2>
    ${gaImages.map((img, i) => `
    <div class="ga-img-wrap reveal">
      <img src="${esc(img.src)}" alt="${esc(img.alt || `General Arrangement ${i + 1}`)}" loading="lazy">
      <div class="ga-img-caption">${esc(img.alt || `General Arrangement ${i + 1}`)} · ${esc(vessel.name)}</div>
    </div>`).join("")}
  </div>
</section>` : ""}
${videos.length > 0 ? `
<section class="videos-section" id="videos">
  <div class="container" style="padding-top:80px;padding-bottom:80px;">
    <p class="section-eyebrow reveal">Media</p>
    <div class="gold-rule reveal"></div>
    <h2 class="section-title reveal" style="margin-bottom:52px;"><em>Videos</em></h2>
    <div class="videos-grid reveal">
      ${videos.map((vid, i) => `
      <div class="video-item">
        <div class="video-embed-wrap">
          <iframe src="${esc(vid.url)}" title="${esc(vid.title || `Video ${i + 1}`)}"
            frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen loading="lazy"></iframe>
        </div>
        ${vid.title ? `<div class="video-caption">${esc(vid.title)}</div>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>` : ""}
${perfItems.length >= 2 ? `
<div class="perf-banner">
  <div class="perf-grid">
    ${perfItems.slice(0, 4).map(p => `<div class="perf-item"><div class="perf-number">${esc(p.num)}<sup>${esc(p.suf)}</sup></div><div class="perf-label">${esc(p.label)}</div><div class="perf-sub">${esc(p.sub)}</div></div>`).join("")}
  </div>
</div>` : ""}
<section class="specs" id="specifications">
  <div class="container">
    <p class="section-eyebrow reveal">Technical Data</p>
    <div class="gold-rule reveal"></div>
    <h2 class="section-title reveal" style="margin-bottom:48px;">Full <em>Specifications</em></h2>
    <div class="specs-table reveal">
      <div class="spec-header">Identity &amp; Registration</div>
      ${specRow("Vessel Name", vessel.name)}${specRow("Builder", vessel.builder)}
      ${specRow("Year / Delivery", vessel.year ? String(vessel.year) : "")}${specRow("Location", vessel.location)}
      ${specRow("Asking Price", vessel.price)}${specRow("Price (EUR)", (vessel as any).askingPriceEUR || "")}
      ${specRow("VAT Status", (vessel as any).vatStatus || "")}${specRow("Stock Number", vessel.stockNumber)}
      ${specRow("Hull Number", (vessel as any).hullNumber || "")}${specRow("IMO Number", (vessel as any).imoNumber || "")}
      ${specRow("MMSI Number", (vessel as any).mmsiNumber || "")}${specRow("Registry Port", (vessel as any).registryPort || "")}
      ${specRow("Home Port", (vessel as any).homePort || "")}${specRow("Flag State", vessel.flagState)}
      ${specRow("Navigation Class", (vessel as any).navalClass || "")}${specRow("Class Society", vessel.classification)}
      ${specRow("Gross Tonnage", vessel.grossTonnage)}${specRow("Refit Details", (vessel as any).refitDetails || "")}
      <div class="spec-header">Dimensions</div>
      ${specRow("Length Overall", vessel.loa)}${specRow("Length Waterline", vessel.lwl)}
      ${specRow("Beam", vessel.beam)}${specRow("Max Beam", (vessel as any).beamMax || "")}
      ${specRow("Draft (Max)", vessel.draft)}${specRow("Draft (Min)", (vessel as any).draftMin || "")}
      ${specRow("Air Draft", (vessel as any).airDraft || "")}${specRow("Freeboard", (vessel as any).freeboard || "")}
      ${specRow("Displacement", vessel.displacement)}${specRow("Number of Decks", (vessel as any).deckCount || "")}
      <div class="spec-header">Hull &amp; Construction</div>
      ${specRow("Hull Form", vessel.hullForm)}${specRow("Hull Material", vessel.hullMaterial)}
      ${specRow("Deck Material", (vessel as any).deckMaterial || "")}${specRow("Superstructure", vessel.superstructure)}
      ${specRow("Paint System", (vessel as any).paintSystem || "")}${specRow("Windows / Glazing", (vessel as any).windowGlazing || "")}
      ${specRow("Keel Type", (vessel as any).keelType || "")}${specRow("", "")}
      <div class="spec-header">Design</div>
      ${specRow("Exterior Design", vessel.exteriorDesign)}${specRow("Interior Design", vessel.interiorDesign)}
      ${specRow("Naval Architecture", vessel.navalArchitect)}${specRow("Interior Style", (vessel as any).interiorStyle || "")}
      ${specRow("Colour Scheme", (vessel as any).colorScheme || "")}${specRow("", "")}
      <div class="spec-header">Propulsion</div>
      ${specRow("Main Engines", vessel.engines)}${specRow("Power Output", vessel.power)}
      ${specRow("Engine Hours", (vessel as any).engineHours || "")}${specRow("Gearbox", vessel.gearbox)}
      ${specRow("Propulsion Type", vessel.propulsion)}${specRow("Shaft Count", (vessel as any).shaftCount || "")}
      ${specRow("Propellers", vessel.propellers)}${specRow("Bow Thruster", vessel.bowThruster)}
      ${specRow("Stern Thruster", vessel.sternThruster)}${specRow("Stabilisers", vessel.stabilisers)}
      ${specRow("Stabiliser Make", (vessel as any).stabiliserMake || "")}${specRow("Zero Speed Stabs", (vessel as any).zeroSpeedStabs || "")}
      <div class="spec-header">Performance</div>
      ${specRow("Maximum Speed", vessel.maxSpeed)}${specRow("Cruise Speed", vessel.cruiseSpeed)}
      ${specRow("Economy Speed", (vessel as any).economySpeed || "")}${specRow("Range (Cruise)", vessel.range)}
      ${specRow("Range (Economy)", (vessel as any).rangeEconomy || "")}${specRow("", "")}
      <div class="spec-header">Electrical &amp; Systems</div>
      ${specRow("Generator Sets", vessel.gensets)}${specRow("Generator Output (kW)", (vessel as any).generatorKW || "")}
      ${specRow("Shore Power", (vessel as any).shorepower || "")}${specRow("Voltage System", (vessel as any).voltageSystem || "")}
      ${specRow("Emergency Generator", (vessel as any).emergencyGen || "")}${specRow("Air Conditioning", vessel.airCon)}
      ${specRow("A/C Make", (vessel as any).airConMake || "")}${specRow("Water Maker", vessel.waterMaker)}
      ${specRow("Water Maker Capacity", (vessel as any).waterMakerCapacity || "")}${specRow("", "")}
      <div class="spec-header">Tank Capacities</div>
      ${specRow("Fuel Capacity", formatCapacity(vessel.fuelTank))}${specRow("Fuel Type", (vessel as any).fuelType || "")}
      ${specRow("Fresh Water", formatCapacity(vessel.freshWater))}${specRow("Holding Tank", formatCapacity(vessel.holdingTank))}
      ${specRow("Grey Water", (vessel as any).greyWater || "")}${specRow("Lube Oil", vessel.lubeOil)}
      ${specRow("Sewage Treatment", (vessel as any).sewageTreatment || "")}${specRow("", "")}
      <div class="spec-header">Accommodation</div>
      ${specRow("Guest Capacity", vessel.guests)}${specRow("Staterooms", vessel.staterooms)}
      ${specRow("Owner's Cabin", (vessel as any).ownersCabin || "")}${specRow("Guest Cabins", (vessel as any).guestCabins || "")}
      ${specRow("Crew", vessel.crew)}${specRow("Crew Cabins", vessel.crewCabins)}
      ${specRow("Crew Mess", (vessel as any).crewMess || "")}${specRow("Interior Area", vessel.livingSpace)}
      <div class="spec-header">Amenities &amp; Deck</div>
      ${specRow("Flybridge", (vessel as any).flybridge || "")}${specRow("Beach Club", (vessel as any).beachClub || "")}
      ${specRow("Swimming Platform", (vessel as any).swimmingPlatform || "")}${specRow("Jacuzzi / Hot Tub", (vessel as any).jacuzzi || "")}
      ${specRow("Gym", (vessel as any).gym || "")}${specRow("Cinema / Theatre", (vessel as any).cinema || "")}
      ${specRow("Tender / Garage", vessel.tender)}${specRow("Tender Count", (vessel as any).tenderCount || "")}
      ${specRow("Water Toys", (vessel as any).toys || "")}${specRow("Garage Details", (vessel as any).garage || "")}
      <div class="spec-header">Navigation &amp; Communications</div>
      ${specRow("Navigation", vessel.navigation)}${specRow("Radar", (vessel as any).radar || "")}
      ${specRow("Chart Plotter", (vessel as any).chartPlotter || "")}${specRow("Autopilot", (vessel as any).autopilot || "")}
      ${specRow("Satcom / VSAT", (vessel as any).satcom || "")}${specRow("AIS", (vessel as any).aisSystem || "")}
      ${specRow("Anchoring System", (vessel as any).anchoring || "")}${specRow("Windlass", (vessel as any).windlass || "")}
      <div class="spec-header">Safety</div>
      ${specRow("Fire Suppression", (vessel as any).fireSuppression || "")}${specRow("Life Rafts", (vessel as any).lifeRafts || "")}
      ${specRow("MOB System", (vessel as any).mobSystem || "")}${specRow("Helideck", (vessel as any).helideck || "")}
      <div class="spec-header">Condition &amp; Service</div>
      ${specRow("Last Survey", (vessel as any).lastSurvey || "")}${specRow("Last Dry Dock", (vessel as any).lastDrydock || "")}
      ${specRow("Last Service", (vessel as any).lastService || "")}${specRow("", "")}
    </div>
  </div>
</section>
<section class="contact" id="contact">
  <div class="container">
    <div class="contact-inner">
      <p class="section-eyebrow">Presented By</p>
      <div class="gold-rule" style="margin:0 auto 36px;"></div>
      <h2 class="section-title" style="text-align:center;">Enquire About<br><em>${esc(vessel.name)}</em></h2>
      <p class="contact-lead">Contact our team to discuss specifications, pricing, and to arrange a private showing.</p>
      ${(vessel as any).pdfUrl ? `<div style="margin-bottom:40px;"><a href="${esc((vessel as any).pdfUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:10px;font-family:'Cinzel',serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-warm);border:1px solid rgba(184,147,58,.4);padding:14px 32px;text-decoration:none;transition:all .25s;" onmouseover="this.style.background='rgba(184,147,58,.08)'" onmouseout="this.style.background='none'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Full Specifications PDF</a></div>` : ""}
      <div class="brokers-row">${brokerCards}</div>
    </div>
  </div>
</section>
<footer>
  <span class="footer-brand">${esc(vessel.name)} · ${esc(vessel.builder || "")}</span>
  <span class="footer-note">${[vessel.loa, vessel.hullMaterial, vessel.year ? `${vessel.year} Delivery` : ""].filter(Boolean).join(" · ")}</span>
</footer>
<script>
const _gd=${JSON.stringify(galleryData)};
let _lbTab='ext',_lbIdx=0;
function setMain(tab,idx){const d=_gd[tab];if(!d||!d[idx])return;document.getElementById(tab+'-main').src=d[idx].src;document.getElementById(tab+'-cap').textContent=d[idx].cap;document.querySelectorAll('#tab-'+tab+' .thumb').forEach((t,i)=>t.classList.toggle('active',i===idx));}
function switchTab(e,id){document.querySelectorAll('.gallery-tabs .tab-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));e.target.classList.add('active');document.getElementById('tab-'+id)?.classList.add('active');}
function openLightbox(tab,idx){_lbTab=tab;_lbIdx=idx;document.getElementById('lb-img').src=_gd[tab][idx].src;document.getElementById('lightbox').classList.add('open');}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open');}
function lbNav(dir){const d=_gd[_lbTab];if(!d)return;_lbIdx=(_lbIdx+dir+d.length)%d.length;document.getElementById('lb-img').src=d[_lbIdx].src;}
document.getElementById('lightbox').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLightbox();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')lbNav(-1);if(e.key==='ArrowRight')lbNav(1);});
document.querySelectorAll('.gallery-main').forEach(m=>{m.addEventListener('click',()=>{const tab=m.closest('.tab-panel').id.replace('tab-','');const active=m.closest('.tab-panel').querySelector('.thumb.active');const idx=active?[...m.closest('.tab-panel').querySelectorAll('.thumb')].indexOf(active):0;openLightbox(tab,idx);});});
const obs=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible');}),{threshold:.08,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
</script>
</body>
</html>`;
}
