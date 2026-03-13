"use client";

import { useEffect, useState } from "react";
import type { CardProfile, CardSocial } from "@/lib/cards/storage";

interface Props {
  profile: CardProfile;
  brokerId: string;
}

function buildVCard(p: CardProfile): string {
  const phone = p.phone?.replace(/\D/g, "") ?? "";
  const companies = (p.companies ?? []).join(" / ");
  const title = (p.titles ?? [])[0] ?? "";
  const nameParts = (p.display_name ?? "").trim().split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName  = nameParts.slice(1).join(" ");
  const ig = (p.socials ?? []).find((s: CardSocial) => s.type === "instagram");
  const li = (p.socials ?? []).find((s: CardSocial) => s.type === "linkedin");
  return [
    "BEGIN:VCARD", "VERSION:3.0",
    `N:${lastName};${firstName};;;`,
    `FN:${p.display_name ?? ""}`,
    `ORG:${companies}`,
    `TITLE:${title}`,
    phone   ? `TEL;TYPE=CELL:+${phone}`      : "",
    p.email ? `EMAIL:${p.email}`             : "",
    p.website ? `URL:${p.website}`           : "",
    p.location ? `ADR;TYPE=WORK:;;${p.location};;;;` : "",
    ig ? `X-SOCIALPROFILE;TYPE=instagram:${ig.url}` : "",
    li ? `X-SOCIALPROFILE;TYPE=linkedin:${li.url}`  : "",
    p.bio ? `NOTE:${p.bio.replace(/\n/g, "\\n")}` : "",
    "END:VCARD",
  ].filter(Boolean).join("\r\n");
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function ScanView({ profile, brokerId }: Props) {
  const accent      = profile.accent_color ?? "#0a2e5c";
  const firstName   = (profile.display_name ?? "").split(" ")[0];
  const [saved,    setSaved]    = useState(false);
  const [step,     setStep]     = useState<"saving" | "form" | "success">("saving");
  const [form,     setForm]     = useState({ name: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState("");

  // ── Auto-download vCard on mount ─────────────────────────────────────────
  useEffect(() => {
    const vcf = buildVCard(profile);
    const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${(profile.display_name ?? "contact").replace(/\s+/g, "_")}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSaved(true);
    // Brief delay so the "saving…" flash feels intentional
    setTimeout(() => setStep("form"), 800);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/cards/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:            form.name.trim(),
          email:           form.email.trim(),
          phone:           form.phone.trim(),
          message:         form.message.trim(),
          card_profile_id: profile.id,
          broker_id:       brokerId,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStep("success");
    } catch {
      setError("Something went wrong — please try again.");
    }
    setSubmitting(false);
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.06)",
    border: "none", borderBottom: `1px solid ${accent}40`,
    color: "#fff", padding: "13px 0",
    fontFamily: "'DM Sans', sans-serif", fontSize: 16,
    outline: "none", transition: "border-color 0.25s",
    WebkitAppearance: "none",
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100dvh", background: "#0a0e18", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::placeholder{color:rgba(255,255,255,0.2);}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 100px #12192b inset;-webkit-text-fill-color:#fff;}
        .inp:focus{border-bottom-color:${accent} !important;}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.5;}}
        .slide{animation:slideUp 0.45s ease forwards;}
        .pulse{animation:pulse 1.2s ease infinite;}
      `}</style>

      {/* ── Header band ── */}
      <div style={{ width: "100%", maxWidth: 440, padding: "0 0 1px" }}>
        <div style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, padding: "32px 28px 28px" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {/* Avatar */}
            <div style={{ width: 60, height: 60, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.3)", overflow: "hidden", background: "rgba(255,255,255,0.15)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {profile.photo_url
                ? <img src={profile.photo_url} alt={profile.display_name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#fff", fontWeight: 600 }}>{getInitials(profile.display_name)}</span>}
            </div>
            {/* Identity */}
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: "#fff", lineHeight: 1.15 }}>{profile.display_name}</div>
              {(profile.titles ?? [])[0] && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 3, fontWeight: 400 }}>{(profile.titles ?? [])[0]}</div>}
              {(profile.companies ?? []).length > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{(profile.companies ?? []).join(" · ")}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ width: "100%", maxWidth: 440, flex: 1, background: "#12192b", padding: "32px 28px 48px" }}>

        {/* SAVING state */}
        {step === "saving" && (
          <div className="pulse" style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📇</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>Saving contact…</div>
          </div>
        )}

        {/* FORM state */}
        {step === "form" && (
          <div className="slide">
            {/* Confirmation pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: `${accent}20`, border: `1px solid ${accent}40`, borderRadius: 12, marginBottom: 28 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{firstName}&apos;s contact saved!</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>Added to your contacts</div>
              </div>
            </div>

            {/* Prompt */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600, color: "#fff", lineHeight: 1.25, marginBottom: 8 }}>
                Now share yours with {firstName}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
                Leave your details and {firstName} will be in touch.
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { key: "name",  label: "Your Name",  type: "text",  req: true,  ph: "Jane Smith" },
                { key: "email", label: "Email",       type: "email", req: true,  ph: "jane@example.com" },
                { key: "phone", label: "Phone",       type: "tel",   req: false, ph: "+1 (555) 000-0000" },
              ].map(({ key, label, type, req, ph }) => (
                <div key={key} style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    {label}{req && <span style={{ color: accent }}> *</span>}
                  </div>
                  <input className="inp" type={type} required={req} placeholder={ph}
                    value={form[key as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inp} />
                </div>
              ))}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                  Message <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.25)", textTransform: "none" }}>(optional)</span>
                </div>
                <textarea placeholder="What are you looking for?" rows={3} value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  style={{ ...inp, resize: "none", fontFamily: "'DM Sans', sans-serif" }} />
              </div>

              {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 14 }}>{error}</div>}

              <button type="submit" disabled={submitting} style={{ width: "100%", padding: "16px", background: submitting ? `${accent}80` : accent, color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: submitting ? "not-allowed" : "pointer", boxShadow: `0 6px 24px ${accent}50`, transition: "all 0.2s" }}>
                {submitting ? "Sending…" : `Share with ${firstName}`}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <a href={`/card/${brokerId}`} style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>
                View full card →
              </a>
            </div>
          </div>
        )}

        {/* SUCCESS state */}
        {step === "success" && (
          <div className="slide" style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${accent}25`, border: `2px solid ${accent}50`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <span style={{ fontSize: 32 }}>🎉</span>
            </div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 600, color: "#fff", marginBottom: 10 }}>You&apos;re connected!</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 32 }}>
              {firstName} will be in touch shortly.<br />Your contact has been saved.
            </div>
            <a href={`/card/${brokerId}`} style={{ display: "inline-block", padding: "13px 32px", border: `1px solid ${accent}60`, borderRadius: 12, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>
              View {firstName}&apos;s full card
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ width: "100%", maxWidth: 440, background: "#0a0e18", padding: "16px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: "0.05em" }}>
          Powered by <span style={{ color: accent, fontWeight: 600 }}>YotCRM</span>
        </div>
      </div>
    </div>
  );
}
