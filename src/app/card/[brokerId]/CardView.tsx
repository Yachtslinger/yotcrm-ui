"use client";

import { useState, useEffect, useCallback } from "react";
import type { CardProfile, CardLink, CardSocial } from "@/lib/cards/storage";
import {
  Phone, Mail, MessageSquare, Globe, MapPin, ChevronRight,
  Download, Share2, QrCode, UserPlus, Check, X, Anchor,
  Instagram, Facebook, Linkedin, Twitter, Youtube, Pencil,
} from "lucide-react";

// ── Props ────────────────────────────────────────────────────────────────────
interface CardViewProps {
  profiles: CardProfile[];
  initialProfileId: string;
  brokerId: string;
  isOwner?: boolean;
}

// ── vCard generation ─────────────────────────────────────────────────────────
function buildVCard(p: CardProfile): string {
  const phone = p.phone?.replace(/\D/g, "") ?? "";
  const companies = (p.companies ?? []).join(" / ");
  const title = (p.titles ?? [])[0] ?? "";
  const nameParts = (p.display_name ?? "").trim().split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");
  const ig = (p.socials ?? []).find((s: CardSocial) => s.type === "instagram");
  const li = (p.socials ?? []).find((s: CardSocial) => s.type === "linkedin");

  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${lastName};${firstName};;;`,
    `FN:${p.display_name ?? ""}`,
    `ORG:${companies}`,
    `TITLE:${title}`,
    phone ? `TEL;TYPE=CELL:+${phone}` : "",
    p.email ? `EMAIL:${p.email}` : "",
    p.website ? `URL:${p.website}` : "",
    p.location ? `ADR;TYPE=WORK:;;${p.location};;;;` : "",
    ig ? `X-SOCIALPROFILE;TYPE=instagram:${ig.url}` : "",
    li ? `X-SOCIALPROFILE;TYPE=linkedin:${li.url}` : "",
    p.bio ? `NOTE:${p.bio.replace(/\n/g, "\\n")}` : "",
    "END:VCARD",
  ].filter(Boolean).join("\r\n");
}

function downloadVCard(p: CardProfile) {
  const blob = new Blob([buildVCard(p)], { type: "text/vcard" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(p.display_name ?? "contact").replace(/\s+/g, "_")}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Icon helpers ─────────────────────────────────────────────────────────────
function LinkIcon({ type, icon }: { type: string; icon: string | null }) {
  const cls = "w-5 h-5";
  if (type === "phone") return <Phone className={cls} />;
  if (type === "email") return <Mail className={cls} />;
  if (type === "sms")   return <MessageSquare className={cls} />;
  if (icon === "anchor") return <Anchor className={cls} />;
  return <Globe className={cls} />;
}

function SocialIcon({ type }: { type: string }) {
  const cls = "w-5 h-5";
  if (type === "instagram") return <Instagram className={cls} />;
  if (type === "linkedin")  return <Linkedin className={cls} />;
  if (type === "facebook")  return <Facebook className={cls} />;
  if (type === "twitter")   return <Twitter className={cls} />;
  if (type === "youtube")   return <Youtube className={cls} />;
  return <Globe className={cls} />;
}

function linkHref(link: CardLink): string {
  return link.value ?? "#";
}

// ── Initials fallback ────────────────────────────────────────────────────────
function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// ── Edit Modal ───────────────────────────────────────────────────────────────
interface EditModalProps {
  profile: CardProfile;
  accent: string;
  onSave: (data: Partial<CardProfile>) => Promise<void>;
  onClose: () => void;
}

function EditModal({ profile, accent, onSave, onClose }: EditModalProps) {
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    display_name:  profile.display_name  ?? "",
    bio:           profile.bio           ?? "",
    location:      profile.location      ?? "",
    phone:         profile.phone         ?? "",
    email:         profile.email         ?? "",
    website:       profile.website       ?? "",
    accent_color:  profile.accent_color  ?? "#0a2e5c",
    banner_url:    profile.banner_url    ?? "",
    photo_url:     profile.photo_url     ?? "",
    titles_raw:    (profile.titles   ?? []).join("\n"),
    companies_raw: (profile.companies ?? []).join("\n"),
  });

  function set(k: string, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      display_name:  fields.display_name,
      bio:           fields.bio,
      location:      fields.location,
      phone:         fields.phone,
      email:         fields.email,
      website:       fields.website,
      accent_color:  fields.accent_color,
      banner_url:    fields.banner_url || null,
      photo_url:     fields.photo_url  || null,
      titles:    fields.titles_raw.split("\n").map((s) => s.trim()).filter(Boolean),
      companies: fields.companies_raw.split("\n").map((s) => s.trim()).filter(Boolean),
    });
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1.5px solid #e8e8e8", fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    outline: "none", boxSizing: "border-box",
    background: "#fafafa", color: "#111",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#666",
    display: "block", marginBottom: 4, textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
        }}
      />
      {/* Centered modal */}
      <div className="card-slide" style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "calc(100% - 32px)", maxWidth: 420,
        maxHeight: "88dvh", overflowY: "auto",
        background: "#fff", borderRadius: 20,
        padding: "24px 20px 28px",
        zIndex: 50,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 20, fontWeight: 600, color: "#111", margin: 0,
          }}>Edit Card</h2>
          <button
            onClick={onClose}
            style={{
              background: "#f5f5f5", border: "none", borderRadius: "50%",
              width: 32, height: 32, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#666",
            }}
          ><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Display Name</label>
            <input style={inputStyle} value={fields.display_name}
              onChange={(e) => set("display_name", e.target.value)} />
          </div>

          {/* Titles */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Titles <span style={{ fontWeight: 400, color: "#aaa", textTransform: "none" }}>(one per line)</span></label>
            <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }}
              value={fields.titles_raw}
              onChange={(e) => set("titles_raw", e.target.value)} />
          </div>

          {/* Companies */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Companies <span style={{ fontWeight: 400, color: "#aaa", textTransform: "none" }}>(one per line)</span></label>
            <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }}
              value={fields.companies_raw}
              onChange={(e) => set("companies_raw", e.target.value)} />
          </div>

          {/* Bio */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Bio</label>
            <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }}
              value={fields.bio}
              onChange={(e) => set("bio", e.target.value)} />
          </div>

          {/* Location */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={fields.location}
              onChange={(e) => set("location", e.target.value)} />
          </div>

          {/* Phone + Email */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} type="tel" value={fields.phone}
                onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={fields.email}
                onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          {/* Website */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Website URL</label>
            <input style={inputStyle} type="url" value={fields.website}
              onChange={(e) => set("website", e.target.value)} />
          </div>

          {/* Accent color */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Accent Color</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="color" value={fields.accent_color}
                onChange={(e) => set("accent_color", e.target.value)}
                style={{ width: 44, height: 36, borderRadius: 8, border: "1.5px solid #e8e8e8",
                  cursor: "pointer", padding: 2, background: "#fafafa" }} />
              <input style={{ ...inputStyle, flex: 1 }} value={fields.accent_color}
                onChange={(e) => set("accent_color", e.target.value)} />
            </div>
          </div>

          {/* Banner URL */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Banner Image URL</label>
            <input style={inputStyle} type="url" value={fields.banner_url}
              onChange={(e) => set("banner_url", e.target.value)} />
          </div>

          {/* Photo URL */}
          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Profile Photo URL</label>
            <input style={inputStyle} type="url" value={fields.photo_url}
              onChange={(e) => set("photo_url", e.target.value)} />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-tap"
            style={{
              width: "100%", padding: "14px",
              background: saving ? `${accent}80` : accent,
              color: "#fff", border: "none", borderRadius: 12,
              fontSize: 15, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: saving ? "not-allowed" : "pointer",
              boxShadow: `0 4px 16px ${accent}40`,
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CardView({ profiles, initialProfileId, brokerId, isOwner = false }: CardViewProps) {
  const [activeId, setActiveId]     = useState(initialProfileId);
  const [showQR, setShowQR]         = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [showEdit, setShowEdit]     = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const [formState, setFormState]   = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [form, setForm]             = useState({ name: "", email: "", phone: "", message: "" });
  // Loaded profile cache (links + socials arrive from server for initial, fetched lazily for others)
  const [profileCache, setProfileCache] = useState<Record<string, CardProfile>>(
    () => {
      const map: Record<string, CardProfile> = {};
      for (const p of profiles) map[p.profile_id] = p;
      return map;
    }
  );

  const profile = profileCache[activeId] ?? profiles[0];
  const accent = profile?.accent_color ?? "#0a2e5c";

  // ── Track view on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    fetch("/api/cards/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_profile_id: profile.id, broker_id: brokerId }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ── Auto-dismiss toast ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Lazy-load profile details when switching ──────────────────────────────
  const switchProfile = useCallback(async (pid: string) => {
    setActiveId(pid);
    setShowQR(false);
    if (profileCache[pid]?.links) return; // already loaded
    try {
      const res = await fetch(`/api/cards/${brokerId}/${pid}`);
      const data = await res.json();
      if (data.profile) {
        setProfileCache((prev) => ({ ...prev, [pid]: data.profile }));
      }
    } catch { /* silent */ }
  }, [brokerId, profileCache]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleSaveContact() {
    downloadVCard(profile);
    showToast("Contact saved!");
  }

  async function handleShare() {
    const url = `${window.location.origin}/card/${brokerId}/${activeId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.display_name ?? "Digital Card", url });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setFormState("submitting");
    try {
      const res = await fetch("/api/cards/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          card_profile_id: profile.id,
          broker_id: brokerId,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setFormState("success");
    } catch {
      setFormState("error");
    }
  }

  function showToast(msg: string) { setToast(msg); }

  async function handleEditSave(updated: Partial<CardProfile>) {
    try {
      const res = await fetch(`/api/cards/${brokerId}/${activeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      if (data.profile) {
        setProfileCache((prev) => ({ ...prev, [activeId]: data.profile }));
      }
      setShowEdit(false);
      showToast("Profile updated!");
    } catch {
      showToast("Save failed — try again.");
    }
  }

  const links  = profile?.links   ?? [];
  const socials = profile?.socials ?? [];
  const qrUrl   = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    typeof window !== "undefined"
      ? `${window.location.origin}/card/${brokerId}/${activeId}/scan`
      : `https://yotcrm-production.up.railway.app/card/${brokerId}/${activeId}/scan`
  )}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100dvh", background: "#f0f0f0" }}>
      <style>{`
        @keyframes fadeIn   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp  { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes slideDown{ from { transform: translateY(-12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .card-fade   { animation: fadeIn  0.2s ease both }
        .card-slide  { animation: slideUp 0.3s ease both }
        .btn-tap:active { transform: scale(0.97); }
        .link-row:active { opacity: 0.75; }
      `}</style>

      {/* ── Card shell ── */}
      <div className="card-fade" style={{
        maxWidth: 440, margin: "0 auto", background: "#fff",
        minHeight: "100dvh", position: "relative", overflow: "hidden",
      }}>

        {/* ══ BANNER ══ */}
        <div style={{ position: "relative", height: 200, overflow: "hidden", flexShrink: 0 }}>
          {profile.banner_url ? (
            <img
              src={profile.banner_url}
              alt="banner"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: accent }} />
          )}
          {/* Darkening overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.1) 40%, transparent 100%)",
          }} />
          {/* Gradient fade to accent at bottom */}
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(to bottom, transparent 40%, ${accent}ee 100%)`,
          }} />

          {/* Edit button — top left, owner only */}
          {isOwner && (
            <button
              className="btn-tap"
              onClick={() => setShowEdit(true)}
              style={{
                position: "absolute", top: 14, left: 14, zIndex: 10,
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(255,255,255,0.25)",
                border: "1.5px solid rgba(255,255,255,0.6)",
                backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#fff",
              }}
            >
              <Pencil size={15} />
            </button>
          )}

          {/* Profile switcher — top right */}
          {profiles.length > 1 && (            <div style={{
              position: "absolute", top: 14, right: 14,
              display: "flex", gap: 6, zIndex: 10,
            }}>
              {profiles.map((p) => (
                <button
                  key={p.profile_id}
                  className="btn-tap"
                  onClick={() => switchProfile(p.profile_id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    letterSpacing: "0.02em",
                    background: activeId === p.profile_id ? "#fff" : "rgba(255,255,255,0.25)",
                    color: activeId === p.profile_id ? accent : "#fff",
                    border: "1.5px solid rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    backdropFilter: "blur(6px)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ══ PROFILE PHOTO ══ */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{
            width: 104, height: 104, borderRadius: "50%",
            border: "4px solid #fff",
            marginTop: -52,
            overflow: "hidden",
            background: accent,
            flexShrink: 0,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            zIndex: 2,
            position: "relative",
          }}>
            {profile.photo_url ? (
              <img
                src={profile.photo_url}
                alt={profile.display_name ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 32, fontWeight: 700,
                fontFamily: "'Playfair Display', serif",
              }}>
                {getInitials(profile.display_name)}
              </div>
            )}
          </div>
        </div>

        {/* ══ IDENTITY ══ */}
        <div className="card-slide" style={{ textAlign: "center", padding: "14px 24px 0" }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28, fontWeight: 600,
            color: "#111", margin: 0, lineHeight: 1.2,
          }}>
            {profile.display_name ?? ""}
          </h1>

          {/* Titles */}
          {(profile.titles ?? []).map((t, i) => (
            <p key={i} style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: i === 0 ? 14 : 13,
              fontWeight: i === 0 ? 500 : 400,
              color: i === 0 ? "#444" : "#777",
              margin: i === 0 ? "6px 0 0" : "2px 0 0",
            }}>{t}</p>
          ))}

          {/* Location */}
          {profile.location && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 4, marginTop: 8, color: "#888", fontSize: 13,
            }}>
              <MapPin size={13} />
              <span>{profile.location}</span>
            </div>
          )}

          {/* Company pills */}
          {(profile.companies ?? []).length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", justifyContent: "center",
              gap: 6, marginTop: 10,
            }}>
              {(profile.companies ?? []).map((c, i) => (
                <span key={i} style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 500,
                  background: `${accent}0d`,
                  border: `1px solid ${accent}1f`,
                  color: accent,
                }}>{c}</span>
              ))}
            </div>
          )}
        </div>

        {/* ══ BIO ══ */}
        {profile.bio && (
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontStyle: "italic",
            fontSize: 13.5,
            color: "#666",
            textAlign: "center",
            margin: "14px 28px 0",
            lineHeight: 1.6,
          }}>
            {profile.bio}
          </p>
        )}

        {/* ══ ACTION BUTTONS ══ */}
        <div style={{
          display: "flex", justifyContent: "center",
          gap: 12, padding: "20px 24px 0",
        }}>
          {[
            { icon: <Download size={20} />, label: "Save", onClick: handleSaveContact },
            { icon: <Share2 size={20} />,   label: "Share",  onClick: handleShare },
            { icon: <QrCode size={20} />,   label: "QR Code", onClick: () => setShowQR((v) => !v) },
            { icon: <UserPlus size={20} />, label: "Connect", onClick: () => setShowForm(true) },
          ].map(({ icon, label, onClick }) => (
            <button
              key={label}
              className="btn-tap"
              onClick={onClick}
              style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 5, width: 70, height: 70,
                background: label === "Connect" ? accent : "#f5f5f5",
                color: label === "Connect" ? "#fff" : accent,
                border: "none", borderRadius: 18,
                cursor: "pointer", fontSize: 11,
                fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s ease",
                boxShadow: label === "Connect" ? `0 4px 16px ${accent}40` : "none",
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* ══ QR CODE ══ */}
        {showQR && (
          <div className="card-slide" style={{
            margin: "16px 24px 0",
            padding: 20,
            background: "#fafafa",
            borderRadius: 18,
            display: "flex", flexDirection: "column",
            alignItems: "center", gap: 12,
          }}>
            <img
              src={qrUrl}
              alt="QR code"
              width={180} height={180}
              style={{ borderRadius: 12, display: "block" }}
            />
            <p style={{ fontSize: 12, color: "#888", margin: 0, textAlign: "center" }}>
              Scan to save contact &amp; connect
            </p>
          </div>
        )}

        {/* ══ LINK ROWS ══ */}
        {links.length > 0 && (
          <div style={{ margin: "20px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
            {links.map((link) => (
              <a
                key={link.id}
                href={linkHref(link)}
                target={link.type === "url" ? "_blank" : undefined}
                rel={link.type === "url" ? "noopener noreferrer" : undefined}
                className="link-row"
                style={{
                  display: "flex", alignItems: "center",
                  padding: "14px 16px",
                  background: "#fafafa",
                  border: "1px solid #f0f0f0",
                  borderRadius: 14,
                  textDecoration: "none",
                  color: "#222",
                  gap: 14,
                  transition: "opacity 0.1s ease",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: `${accent}0d`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: accent, flexShrink: 0,
                }}>
                  <LinkIcon type={link.type} icon={link.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>
                    {link.label}
                  </div>
                  {link.value && (
                    <div style={{
                      fontSize: 12, color: "#999", marginTop: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {link.value.replace(/^(tel:|mailto:|sms:)/, "")}
                    </div>
                  )}
                </div>
                <ChevronRight size={16} color="#ccc" />
              </a>
            ))}
          </div>
        )}

        {/* ══ SOCIAL ICONS ══ */}
        {socials.length > 0 && (
          <div style={{
            display: "flex", justifyContent: "center",
            gap: 12, padding: "20px 24px 0",
          }}>
            {socials.map((s) => (
              <a
                key={s.id}
                href={s.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-tap"
                style={{
                  width: 46, height: 46, borderRadius: "50%",
                  background: `${accent}0d`,
                  border: `1.5px solid ${accent}1f`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: accent, textDecoration: "none",
                  transition: "all 0.15s ease",
                }}
              >
                <SocialIcon type={s.type} />
              </a>
            ))}
          </div>
        )}

        {/* ══ FOOTER ══ */}
        <div style={{
          textAlign: "center",
          padding: "28px 24px 36px",
          fontSize: 12,
          color: "#bbb",
          fontWeight: 400,
          letterSpacing: "0.04em",
        }}>
          Powered by{" "}
          <span style={{ color: accent, fontWeight: 600 }}>YotCRM</span>
        </div>

      </div>{/* end card shell */}

      {/* ══ CONNECT FORM MODAL ══ */}
      {showForm && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => { setShowForm(false); setFormState("idle"); }}
            style={{
              position: "fixed", inset: 0, zIndex: 40,
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(4px)",
            }}
          />
          {/* Bottom sheet */}
          <div className="card-slide" style={{
            position: "fixed", bottom: 0, left: "50%",
            transform: "translateX(-50%)",
            width: "100%", maxWidth: 440,
            background: "#fff",
            borderRadius: "24px 24px 0 0",
            padding: "24px 24px 40px",
            zIndex: 50,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
          }}>
            {/* Handle */}
            <div style={{
              width: 40, height: 4, borderRadius: 2,
              background: "#e0e0e0", margin: "-8px auto 20px",
            }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 22, fontWeight: 600, color: "#111", margin: 0,
              }}>
                {formState === "success" ? "You're connected!" : `Connect with ${(profile.display_name ?? "").split(" ")[0]}`}
              </h2>
              <button
                onClick={() => { setShowForm(false); setFormState("idle"); }}
                style={{
                  background: "#f5f5f5", border: "none", borderRadius: "50%",
                  width: 32, height: 32, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#666",
                }}
              ><X size={16} /></button>
            </div>

            {formState === "success" ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: `${accent}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <Check size={28} color={accent} />
                </div>
                <p style={{ color: "#666", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                  {`${(profile.display_name ?? "").split(" ")[0]} will be in touch shortly.`}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {[
                  { key: "name",    label: "Name",    type: "text",  required: true,  placeholder: "Your name" },
                  { key: "email",   label: "Email",   type: "email", required: true,  placeholder: "your@email.com" },
                  { key: "phone",   label: "Phone",   type: "tel",   required: false, placeholder: "+1 (555) 000-0000" },
                ].map(({ key, label, type, required, placeholder }) => (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 5 }}>
                      {label}{required && <span style={{ color: accent }}> *</span>}
                    </label>
                    <input
                      type={type}
                      required={required}
                      placeholder={placeholder}
                      value={form[key as keyof typeof form]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      style={{
                        width: "100%", padding: "12px 14px",
                        borderRadius: 12, border: "1.5px solid #e8e8e8",
                        fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                        outline: "none", boxSizing: "border-box",
                        background: "#fafafa", color: "#111",
                      }}
                    />
                  </div>
                ))}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 5 }}>
                    Message <span style={{ fontWeight: 400, color: "#aaa" }}>(optional)</span>
                  </label>
                  <textarea
                    placeholder="What are you looking for?"
                    value={form.message}
                    rows={3}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    style={{
                      width: "100%", padding: "12px 14px",
                      borderRadius: 12, border: "1.5px solid #e8e8e8",
                      fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                      outline: "none", resize: "none",
                      boxSizing: "border-box", background: "#fafafa", color: "#111",
                    }}
                  />
                </div>

                {formState === "error" && (
                  <p style={{ color: "#e05", fontSize: 13, marginBottom: 12 }}>
                    Something went wrong — please try again.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={formState === "submitting"}
                  className="btn-tap"
                  style={{
                    width: "100%", padding: "15px",
                    background: formState === "submitting" ? `${accent}80` : accent,
                    color: "#fff", border: "none", borderRadius: 14,
                    fontSize: 15, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: formState === "submitting" ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                    boxShadow: `0 4px 20px ${accent}40`,
                  }}
                >
                  {formState === "submitting" ? "Sending…" : "Send Message"}
                </button>
              </form>
            )}
          </div>
        </>
      )}

      {/* ══ EDIT MODAL ══ */}
      {isOwner && showEdit && (
        <EditModal
          profile={profile}
          accent={accent}
          onSave={handleEditSave}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* ══ TOAST ══ */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(20,20,20,0.92)",
          color: "#fff", padding: "10px 20px",
          borderRadius: 24, fontSize: 13,
          fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
          zIndex: 100, whiteSpace: "nowrap",
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          animation: "fadeIn 0.15s ease",
        }}>
          {toast}
        </div>
      )}

    </div>
  );
}
