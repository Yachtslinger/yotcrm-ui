"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "../types";
import { emailPaolo, textPaolo } from "../ClientActions";
import { useToast } from "../../components/ToastProvider";
import {
  Shield, RefreshCw, CheckCircle, AlertTriangle, HelpCircle, XCircle,
  Building2, Ship, Plane, Globe, Linkedin, ExternalLink,
  Briefcase, DollarSign, Activity,
} from "lucide-react";
import Dossier from "../Dossier";

const STATUS_OPTIONS = [
  { value: "new", label: "New", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  { value: "hot", label: "Hot", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  { value: "warm", label: "Warm", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "cold", label: "Cold", color: "bg-gray-200 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300" },
  { value: "nurture", label: "Nurture", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "client", label: "✓ Client", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "other", label: "Other", color: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300" },
];

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LeadDetailPage(props: Props) {
  const params = await props.params;
  return <LeadDetailPageClient id={params.id} />;
}

function LeadDetailPageClient({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lead, setLead] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<Contact | null>(null);
  const [intel, setIntel] = useState<any>(null);
  const [intelSources, setIntelSources] = useState<any[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const fetchIntel = useCallback(async (leadId: string) => {
    try {
      const res = await fetch(`/api/intel/profile?lead_id=${leadId}`);
      const data = await res.json();
      if (data.ok && data.profile) {
        setIntel(data.profile);
        setIntelSources(data.sources || []);
      }
    } catch { /* ignore */ }
  }, []);

  const runEnrich = async () => {
    setEnriching(true);
    try {
      const res = await fetch("/api/intel/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: Number(id), action: "enrich" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Lighthouse: ${data.score}/100 — ${(data.band || "").replace(/_/g, " ")}`);
        fetchIntel(id);
        // Refresh lead data to pick up newly discovered fields
        const leadRes = await fetch(`/api/clients/${encodeURIComponent(id)}`);
        if (leadRes.ok) {
          const ld = await leadRes.json();
          const refreshed: Contact = {
            ...lead!,
            occupation: ld.occupation || "",
            employer: ld.employer || "",
            city: ld.city || "",
            state: ld.state || "",
            zip: ld.zip || "",
            linkedin_url: ld.linkedin_url || "",
            facebook_url: ld.facebook_url || "",
            instagram_url: ld.instagram_url || "",
            twitter_url: ld.twitter_url || "",
            net_worth_range: ld.net_worth_range || "",
            net_worth_confidence: ld.net_worth_confidence || "",
            board_positions: ld.board_positions || "",
            yacht_clubs: ld.yacht_clubs || "",
            nonprofit_roles: ld.nonprofit_roles || "",
            total_donations: ld.total_donations || "",
            property_summary: ld.property_summary || "",
            wikipedia_url: ld.wikipedia_url || "",
            website_url: ld.website_url || "",
            media_mentions: ld.media_mentions || 0,
            estimated_net_worth: ld.estimated_net_worth || "",
            net_worth_breakdown: ld.net_worth_breakdown || "",
            date_of_birth: ld.date_of_birth || "",
            age: ld.age || "",
            spouse_name: ld.spouse_name || "",
            spouse_employer: ld.spouse_employer || "",
            primary_address: ld.primary_address || "",
            secondary_addresses: ld.secondary_addresses || "[]",
            identity_confidence: ld.identity_confidence || 0,
            identity_verifications: ld.identity_verifications || "[]",
            manual_corrections: ld.manual_corrections || "[]",
            court_records: ld.court_records || "",
            professional_history: ld.professional_history || "",
            relatives: ld.relatives || "",
            additional_properties: ld.additional_properties || "",
            reverify_status: ld.reverify_status || "",
          };
          setLead(refreshed);
          setForm(refreshed);
        }
      } else {
        toast(data.error || "Enrichment failed", "error");
      }
    } catch { toast("Enrichment failed", "error"); }
    finally { setEnriching(false); }
  };

  useEffect(() => {
    const fetchLead = async () => {
      try {
        const decodedId = decodeURIComponent(id);
        console.log("Fetching lead with ID:", decodedId);
        const res = await fetch(`/api/clients/${encodeURIComponent(decodedId)}`);
        console.log("Response status:", res.status);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        console.log("Fetched data:", data);
        
        // Normalize the data
        const normalized: Contact = {
          id: data.id || id,
          firstName: data.first_name || data.firstName || "",
          lastName: data.last_name || data.lastName || "",
          email: data.email || "",
          phone: data.phone || "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          status: data.status || "other",
          notes: data.notes || "",
          source: data.source || "",
          createdAt: data.created_at || data.createdAt,
          boat_make: data.boat_make || "",
          boat_model: data.boat_model || "",
          boat_year: data.boat_year || "",
          boat_length: data.boat_length || "",
          boat_price: data.boat_price || "",
          boat_location: data.boat_location || "",
          listing_url: data.listing_url || "",
          occupation: data.occupation || "",
          employer: data.employer || "",
          city: data.city || "",
          state: data.state || "",
          zip: data.zip || "",
          linkedin_url: data.linkedin_url || "",
          facebook_url: data.facebook_url || "",
          instagram_url: data.instagram_url || "",
          twitter_url: data.twitter_url || "",
          net_worth_range: data.net_worth_range || "",
          net_worth_confidence: data.net_worth_confidence || "",
          board_positions: data.board_positions || "",
          yacht_clubs: data.yacht_clubs || "",
          nonprofit_roles: data.nonprofit_roles || "",
          total_donations: data.total_donations || "",
          property_summary: data.property_summary || "",
          wikipedia_url: data.wikipedia_url || "",
          website_url: data.website_url || "",
          media_mentions: data.media_mentions || 0,
          estimated_net_worth: data.estimated_net_worth || "",
          net_worth_breakdown: data.net_worth_breakdown || "",
          date_of_birth: data.date_of_birth || "",
          age: data.age || "",
          spouse_name: data.spouse_name || "",
          spouse_employer: data.spouse_employer || "",
          primary_address: data.primary_address || "",
          secondary_addresses: data.secondary_addresses || "[]",
          identity_confidence: data.identity_confidence || 0,
          identity_verifications: data.identity_verifications || "[]",
          manual_corrections: data.manual_corrections || "[]",
          court_records: data.court_records || "",
          professional_history: data.professional_history || "",
          relatives: data.relatives || "",
          additional_properties: data.additional_properties || "",
          reverify_status: data.reverify_status || "",
          broker_notes: data.broker_notes || "",
        };
        
        setLead(normalized);
        setForm(normalized);
        fetchIntel(data.id || id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLead();
  }, [id, fetchIntel]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    
    try {
      const decodedId = decodeURIComponent(id);
      const res = await fetch(`/api/clients/${encodeURIComponent(decodedId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          status: form.status,
          notes: form.notes,
          boat_make: form.boat_make,
          boat_model: form.boat_model,
          boat_year: form.boat_year,
          boat_length: form.boat_length,
          boat_price: form.boat_price,
          boat_location: form.boat_location,
          listing_url: form.listing_url,
          occupation: form.occupation,
          employer: form.employer,
          city: form.city,
          state: form.state,
          zip: form.zip,
          linkedin_url: form.linkedin_url,
          facebook_url: form.facebook_url,
          instagram_url: form.instagram_url,
          twitter_url: form.twitter_url,
          date_of_birth: form.date_of_birth,
          age: form.age,
          spouse_name: form.spouse_name,
          spouse_employer: form.spouse_employer,
          primary_address: form.primary_address,
          secondary_addresses: form.secondary_addresses,
          estimated_net_worth: form.estimated_net_worth,
          broker_notes: form.broker_notes,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      
      const updated = await res.json();
      setLead(updated);
      setForm(updated);
      setEditing(false);
      toast("Changes saved");
    } catch (err) {
      console.error(err);
      toast("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddToContacts = async () => {
    if (!lead) return;
    try {
      // Generate vCard and download it
      const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "New Lead";
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${fullName}`,
        `N:${lead.lastName ?? ''};${lead.firstName ?? ''};;;`,
        lead.email ? `EMAIL:${lead.email}` : '',
        lead.phone ? `TEL:${lead.phone}` : '',
        lead.notes ? `NOTE:${lead.notes.substring(0, 200)}` : '',
        'END:VCARD'
      ].filter(Boolean).join('\n');
      
      const blob = new Blob([vcard], { type: 'text/vcard' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fullName.replace(/\s+/g, '_')}.vcf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Contact card downloaded");
    } catch (err) {
      console.error(err);
      toast("Failed to add to contacts", "error");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const decodedId = decodeURIComponent(id);
      const res = await fetch(`/api/clients/${encodeURIComponent(decodedId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/clients");
    } catch (err) {
      console.error(err);
      alert("Failed to delete lead");
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return;
    try {
      const decodedId = decodeURIComponent(id);
      const res = await fetch(`/api/clients/${encodeURIComponent(decodedId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      setLead({ ...lead, status: newStatus });
      if (form) setForm({ ...form, status: newStatus });
      toast(`Status updated to ${newStatus}`);
    } catch (err) {
      console.error(err);
      toast("Failed to update status", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Lead not found</div>
      </div>
    );
  }

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Untitled";
  const boatDisplay = [lead.boat_year, lead.boat_length, lead.boat_make, lead.boat_model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <div className="max-w-5xl mx-auto px-4 py-5 md:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <button
            onClick={() => router.push("/clients")}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            ← Back
          </button>
          <div className="flex gap-2">
            {!editing ? (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                  style={{ minHeight: "44px" }}
                >
                  Edit
                </button>
                <button
                  onClick={handleAddToContacts}
                  className="px-3 py-1.5 md:px-4 md:py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs md:text-sm hover:bg-gray-100 dark:hover:bg-neutral-900"
                >
                  + Contacts
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setForm(lead); setEditing(false); }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-neutral-900"
                  style={{ minHeight: "44px" }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                  style={{ minHeight: "44px" }}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Lead Info Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm p-5 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-6 md:mb-8 gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-50">{name}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">{lead.source || "Unknown source"}</p>
              {/* Status Pills */}
              <div className="flex flex-wrap gap-2 mt-3">
                {STATUS_OPTIONS.map((s) => {
                  const active = (lead.status || "other").toLowerCase() === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => handleStatusChange(s.value)}
                      className={`text-sm font-semibold rounded-full px-6 py-2.5 transition-all ${
                        active
                          ? `${s.color} ring-2 ring-offset-1 ring-blue-400 dark:ring-offset-neutral-900`
                          : "bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-700"
                      }`}
                      style={{ minHeight: "44px" }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => emailPaolo(lead)}
                className="px-3 py-1.5 border border-purple-500 text-purple-600 dark:text-purple-300 rounded-lg text-xs hover:bg-purple-50 dark:hover:bg-purple-900/30"
              >
                Email Paolo
              </button>
              <button
                onClick={() => textPaolo(lead)}
                className="px-3 py-1.5 border border-indigo-500 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
              >
                Text Paolo
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 border border-red-300 text-red-500 dark:text-red-400 rounded-lg text-xs hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>

          {/* ═══ DOSSIER — THE HERO ═══ */}
          <div className="mb-8 -mx-2 sm:mx-0">
            <Dossier
              lead={lead}
              intel={intel}
              sources={intelSources}
              leadName={name}
              onRunEnrich={runEnrich}
              enriching={enriching}
            />
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Contact Information
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">First Name</label>
                  {editing ? (
                    <input
                      value={form?.firstName || ""}
                      onChange={(e) => setForm({ ...form!, firstName: e.target.value })}
                      className="form-input w-full mt-1"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">{lead.firstName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Last Name</label>
                  {editing ? (
                    <input
                      value={form?.lastName || ""}
                      onChange={(e) => setForm({ ...form!, lastName: e.target.value })}
                      className="form-input w-full mt-1"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">{lead.lastName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Email</label>
                  {editing ? (
                    <input
                      value={form?.email || ""}
                      onChange={(e) => setForm({ ...form!, email: e.target.value })}
                      className="form-input w-full mt-1"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">
                      {lead.email ? <a href={`mailto:${lead.email}`} className="text-blue-600 dark:text-blue-400 underline">{lead.email}</a> : "—"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Phone</label>
                  {editing ? (
                    <input
                      value={form?.phone || ""}
                      onChange={(e) => setForm({ ...form!, phone: e.target.value })}
                      className="form-input w-full mt-1"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">
                      {lead.phone ? <a href={`tel:${lead.phone}`} className="text-blue-600 dark:text-blue-400 underline">{lead.phone}</a> : "—"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Occupation</label>
                  {editing ? (
                    <input value={form?.occupation || ""} onChange={(e) => setForm({ ...form!, occupation: e.target.value })} className="form-input w-full mt-1" />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">{lead.occupation || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Employer</label>
                  {editing ? (
                    <input value={form?.employer || ""} onChange={(e) => setForm({ ...form!, employer: e.target.value })} className="form-input w-full mt-1" />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">{lead.employer || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Location</label>
                  {editing ? (
                    <div className="flex gap-2 mt-1">
                      <input value={form?.city || ""} onChange={(e) => setForm({ ...form!, city: e.target.value })} placeholder="City" className="form-input flex-1" />
                      <input value={form?.state || ""} onChange={(e) => setForm({ ...form!, state: e.target.value })} placeholder="ST" className="form-input w-16" />
                      <input value={form?.zip || ""} onChange={(e) => setForm({ ...form!, zip: e.target.value })} placeholder="Zip" className="form-input w-20" />
                    </div>
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">
                      {[lead.city, lead.state, lead.zip].filter(Boolean).join(", ") || "—"}
                    </p>
                  )}
                </div>
              </div>

              {/* Social Links */}
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Social Profiles
                </h2>
                <div className="space-y-2">
                  {editing ? (
                    <>
                      <SocialInput label="LinkedIn" value={form?.linkedin_url || ""} onChange={(v) => setForm({ ...form!, linkedin_url: v })} />
                      <SocialInput label="Facebook" value={form?.facebook_url || ""} onChange={(v) => setForm({ ...form!, facebook_url: v })} />
                      <SocialInput label="Instagram" value={form?.instagram_url || ""} onChange={(v) => setForm({ ...form!, instagram_url: v })} />
                      <SocialInput label="Twitter/X" value={form?.twitter_url || ""} onChange={(v) => setForm({ ...form!, twitter_url: v })} />
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <SocialLink label="LinkedIn" url={lead.linkedin_url} color="#0077B5" />
                      <SocialLink label="Facebook" url={lead.facebook_url} color="#1877F2" />
                      <SocialLink label="Instagram" url={lead.instagram_url} color="#E4405F" />
                      <SocialLink label="Twitter/X" url={lead.twitter_url} color="#1DA1F2" />
                      {!lead.linkedin_url && !lead.facebook_url && !lead.instagram_url && !lead.twitter_url && (
                        <span className="text-xs text-gray-400">No social profiles found — run intel to discover</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Deep Background Fields */}
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Background Details
                </h2>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Date of Birth</label>
                      {editing ? (
                        <input value={form?.date_of_birth || ""} onChange={(e) => setForm({ ...form!, date_of_birth: e.target.value })} placeholder="MM/DD/YYYY" className="form-input w-full mt-1" />
                      ) : (
                        <p className="text-gray-900 dark:text-gray-100">{lead.date_of_birth || "—"}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Age</label>
                      {editing ? (
                        <input value={form?.age || ""} onChange={(e) => setForm({ ...form!, age: e.target.value })} className="form-input w-full mt-1" />
                      ) : (
                        <p className="text-gray-900 dark:text-gray-100">{lead.age || "—"}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Spouse Name</label>
                      {editing ? (
                        <input value={form?.spouse_name || ""} onChange={(e) => setForm({ ...form!, spouse_name: e.target.value })} className="form-input w-full mt-1" />
                      ) : (
                        <p className="text-gray-900 dark:text-gray-100">{lead.spouse_name || "—"}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Spouse Employer</label>
                      {editing ? (
                        <input value={form?.spouse_employer || ""} onChange={(e) => setForm({ ...form!, spouse_employer: e.target.value })} className="form-input w-full mt-1" />
                      ) : (
                        <p className="text-gray-900 dark:text-gray-100">{lead.spouse_employer || "—"}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Primary Address</label>
                    {editing ? (
                      <input value={form?.primary_address || ""} onChange={(e) => setForm({ ...form!, primary_address: e.target.value })} placeholder="Full address" className="form-input w-full mt-1" />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100">{lead.primary_address || "—"}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Secondary Addresses / Homes</label>
                    {editing ? (
                      <textarea
                        value={(() => { try { const arr = JSON.parse(form?.secondary_addresses || "[]"); return Array.isArray(arr) ? arr.join("\n") : ""; } catch { return form?.secondary_addresses || ""; }})()}
                        onChange={(e) => setForm({ ...form!, secondary_addresses: JSON.stringify(e.target.value.split("\n").filter(Boolean)) })}
                        placeholder="One address per line"
                        className="form-input w-full mt-1 min-h-[60px] resize-none text-sm"
                      />
                    ) : (
                      <div className="text-gray-900 dark:text-gray-100">
                        {(() => { try { const arr = JSON.parse(lead.secondary_addresses || "[]"); return Array.isArray(arr) && arr.length > 0 ? arr.map((a: string, i: number) => <div key={i} className="text-sm">{a}</div>) : "—"; } catch { return "—"; }})()}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Estimated Net Worth</label>
                    {editing ? (
                      <input value={form?.estimated_net_worth || ""} onChange={(e) => setForm({ ...form!, estimated_net_worth: e.target.value })} placeholder="e.g. $1M — $5M" className="form-input w-full mt-1" />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100 font-semibold">{lead.estimated_net_worth || "—"}</p>
                    )}
                  </div>
                  {lead.identity_confidence > 0 && !editing && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Identity Confidence</label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${lead.identity_confidence}%`, background: lead.identity_confidence >= 70 ? "#059669" : lead.identity_confidence >= 40 ? "#d97706" : "#ef4444" }} />
                        </div>
                        <span className="text-xs font-bold" style={{ color: lead.identity_confidence >= 70 ? "#059669" : lead.identity_confidence >= 40 ? "#d97706" : "#ef4444" }}>
                          {lead.identity_confidence}%
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Court Records */}
                  {lead.court_records && !editing && (() => {
                    try { const cr = JSON.parse(lead.court_records); if (!Array.isArray(cr) || cr.length === 0) return null;
                      return (<div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Court Records ({cr.length})</label>
                        <div className="mt-1 space-y-1.5">{cr.map((r: any, i: number) => (
                          <div key={i} className="rounded-lg p-2 text-sm" style={{ background: r.type === "Bankruptcy" ? "rgba(239,68,68,0.05)" : "var(--sand-50, #f9fafb)" }}>
                            <span className="font-bold" style={{ color: r.type === "Bankruptcy" || r.type === "Foreclosure" ? "#ef4444" : "#374151" }}>{r.type}</span>
                            {r.date && <span className="ml-2 text-xs text-gray-400">{r.date}</span>}
                            <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{r.description?.substring(0, 120)}</div>
                          </div>
                        ))}</div>
                      </div>);
                    } catch { return null; }
                  })()}
                  {/* Professional History */}
                  {lead.professional_history && !editing && (() => {
                    try { const ph = JSON.parse(lead.professional_history); if (!Array.isArray(ph) || ph.length === 0) return null;
                      return (<div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Professional History</label>
                        <div className="mt-1 space-y-1">{ph.map((p: any, i: number) => (
                          <div key={i} className="text-sm"><span className="font-semibold">{p.title}</span> at {p.company}</div>
                        ))}</div>
                      </div>);
                    } catch { return null; }
                  })()}
                  {/* Relatives */}
                  {lead.relatives && !editing && (() => {
                    try { const rel = JSON.parse(lead.relatives); if (!Array.isArray(rel) || rel.length === 0) return null;
                      return (<div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Known Associates</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">{rel.map((r: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded text-sm font-medium bg-gray-100 dark:bg-gray-800">{r}</span>
                        ))}</div>
                      </div>);
                    } catch { return null; }
                  })()}
                  {/* Additional Properties */}
                  {lead.additional_properties && !editing && (() => {
                    try { const props = JSON.parse(lead.additional_properties); if (!Array.isArray(props) || props.length === 0) return null;
                      return (<div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Properties</label>
                        <div className="mt-1 space-y-1">{props.map((p: any, i: number) => (
                          <div key={i} className="text-sm flex justify-between">
                            <span>{p.address}</span>
                            {p.estimated_value && <span className="font-bold text-green-600">{p.estimated_value}</span>}
                          </div>
                        ))}</div>
                      </div>);
                    } catch { return null; }
                  })()}
                  {lead.reverify_status && !editing && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Re-Verification</label>
                      <p className="text-sm font-semibold mt-0.5" style={{ color: "#059669" }}>{lead.reverify_status}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>


            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Boat of Interest
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Boat</label>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {boatDisplay || "—"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Make</label>
                    {editing ? (
                      <input
                        value={form?.boat_make || ""}
                        onChange={(e) => setForm({ ...form!, boat_make: e.target.value })}
                        className="form-input w-full mt-1"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100">{lead.boat_make || "—"}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Model</label>
                    {editing ? (
                      <input
                        value={form?.boat_model || ""}
                        onChange={(e) => setForm({ ...form!, boat_model: e.target.value })}
                        className="form-input w-full mt-1"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100">{lead.boat_model || "—"}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Year</label>
                    {editing ? (
                      <input
                        value={form?.boat_year || ""}
                        onChange={(e) => setForm({ ...form!, boat_year: e.target.value })}
                        className="form-input w-full mt-1"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100">{lead.boat_year || "—"}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Length</label>
                    {editing ? (
                      <input
                        value={form?.boat_length || ""}
                        onChange={(e) => setForm({ ...form!, boat_length: e.target.value })}
                        className="form-input w-full mt-1"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100">{lead.boat_length || "—"}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Price</label>
                  {editing ? (
                    <input
                      value={form?.boat_price || ""}
                      onChange={(e) => setForm({ ...form!, boat_price: e.target.value })}
                      className="form-input w-full mt-1"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">{lead.boat_price || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Location</label>
                  {editing ? (
                    <input
                      value={form?.boat_location || ""}
                      onChange={(e) => setForm({ ...form!, boat_location: e.target.value })}
                      className="form-input w-full mt-1"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">{lead.boat_location || "—"}</p>
                  )}
                </div>
                {lead.listing_url && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">Listing</label>
                    <a
                      href={lead.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                    >
                      View Listing →
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ BROKER NOTES ═══ */}
          <BrokerNotesPanel
            leadId={id}
            initialValue={lead.broker_notes || ""}
            onSaved={(val) => { setLead(l => l ? { ...l, broker_notes: val } : l); setForm(f => f ? { ...f, broker_notes: val } : f); }}
          />

          {/* Customer Message (read-only, from lead form) */}
          {lead.notes && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                Original Lead Message
              </h2>
              <p className="text-gray-500 dark:text-gray-400 whitespace-pre-wrap text-sm italic">
                {lead.notes}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}


function BrokerNotesPanel({ leadId, initialValue, onSaved }: {
  leadId: string;
  initialValue: string;
  onSaved: (val: string) => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = React.useState(initialValue);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = React.useRef<any>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync if parent reloads
  React.useEffect(() => { setValue(initialValue); }, [initialValue]);

  // Voice setup
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setValue(prev => {
        const sep = prev && !prev.endsWith("\n") ? " " : "";
        return prev + sep + transcript;
      });
      setListening(false);
    };
    r.onerror = () => setListening(false);
    r.onend   = () => setListening(false);
    recogRef.current = r;
  }, []);

  const saveNow = React.useCallback(async (text: string) => {
    setSaving(true);
    try {
      const decodedId = decodeURIComponent(leadId);
      const res = await fetch(`/api/clients/${encodeURIComponent(decodedId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker_notes: text }),
      });
      if (!res.ok) throw new Error("Failed");
      onSaved(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { toast("Failed to save notes", "error"); }
    finally { setSaving(false); }
  }, [leadId, onSaved, toast]);

  // Debounced auto-save after 1.5s of inactivity
  const handleChange = (text: string) => {
    setValue(text);
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNow(text), 1500);
  };

  const toggleVoice = () => {
    if (!recogRef.current) { toast("Voice not supported in this browser", "info"); return; }
    if (listening) { recogRef.current.stop(); setListening(false); }
    else { recogRef.current.start(); setListening(true); }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
          📋 Client Notes
          <span className="text-[10px] font-normal text-gray-400 normal-case tracking-normal">
            — what they&apos;re looking for, background, preferences
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-500 font-semibold">✓ Saved</span>}
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
          <button
            onClick={toggleVoice}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              listening
                ? "bg-red-500 text-white animate-pulse"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
            style={{ minHeight: "36px" }}
          >
            {listening ? "⏹ Stop" : "🎤 Dictate"}
          </button>
        </div>
      </div>

      {listening && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Listening… speak now
        </div>
      )}

      <textarea
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          if (value !== initialValue) saveNow(value);
        }}
        placeholder="Type or dictate notes about this client — what they're looking for, budget, timeline, personal details, preferences…"
        className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-800 dark:text-gray-100 text-sm p-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 leading-relaxed"
        style={{ minHeight: "160px", fontSize: "16px" }}
      />
      <p className="text-[11px] text-gray-400 mt-1.5">Auto-saves as you type. Use the mic button to dictate.</p>
    </div>
  );
}

function IntelScoreBadge({ score, band }: { score: number; band: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    high_confidence:   { bg: "rgba(16,185,129,0.15)", text: "#059669" },
    likely_legitimate: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
    unverified:        { bg: "rgba(245,158,11,0.15)", text: "#d97706" },
    elevated_risk:     { bg: "rgba(239,68,68,0.15)",  text: "#ef4444" },
  };
  const c = colors[band] || colors.unverified;
  const labels: Record<string, string> = {
    high_confidence: "High Confidence", likely_legitimate: "Likely Legitimate",
    unverified: "Unverified", elevated_risk: "Elevated Risk",
  };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
      style={{ background: c.bg, color: c.text }}>
      <Shield className="w-3 h-3" /> {score}/100 — {labels[band] || band}
    </span>
  );
}

function IntelDisplay({ intel, sources, leadName }: { intel: any; sources: any[]; leadName: string }) {
  const identity = intel.identity_data || {};
  const capital = intel.capital_data || {};
  const risk = intel.risk_data || {};
  const breakdown = intel.score_breakdown || [];

  // Extract structured data from sources
  const byKey = new Map<string, any[]>();
  for (const s of sources) {
    const list = byKey.get(s.data_key) || [];
    list.push(s);
    byKey.set(s.data_key, list);
  }

  // Parse key fields
  const employerSrc = sources.find((s: any) => s.data_key === "employer");
  const occupationSrc = sources.find((s: any) => s.data_key === "occupation");
  const locationSrc = sources.find((s: any) => s.data_key === "location");
  const donationSrc = sources.find((s: any) => s.data_key === "political_donations");
  const donationDetails = sources.filter((s: any) => s.data_key === "donation_detail");
  const domainBizSrc = sources.find((s: any) => s.source_type === "domain" && s.data_key === "business_ownership");
  const domainTypeSrc = sources.find((s: any) => s.source_type === "domain" && s.data_key === "email_domain_type");
  const isBusinessEmail = !!domainBizSrc;
  let domainInfo: any = {};
  try { if (domainBizSrc) domainInfo = JSON.parse(domainBizSrc.data_value); } catch { /* */ }
  let locationInfo: any = {};
  try { if (locationSrc) locationInfo = JSON.parse(locationSrc.data_value); } catch { /* */ }
  let donationInfo: any = {};
  try { if (donationSrc) donationInfo = JSON.parse(donationSrc.data_value); } catch { /* */ }

  // Social profiles
  const socialProfiles = sources
    .filter((s: any) => s.data_key?.startsWith("social_"))
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), key: s.data_key }; } catch { return null; } })
    .filter(Boolean);

  // News
  const newsMentions = sources
    .filter((s: any) => s.data_key === "news_mention")
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), url: s.source_url }; } catch { return null; } })
    .filter(Boolean);

  // Wikipedia
  const wikiSrc = sources.find((s: any) => s.data_key === "wikipedia");

  // Web search intel
  const webTitles = sources.filter((s: any) => s.data_key === "web_title");
  const webCompanies = sources.filter((s: any) => s.data_key === "web_company");
  const webMentions = sources.filter((s: any) => s.data_key === "web_mention")
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), url: s.source_url }; } catch { return null; } })
    .filter(Boolean);
  const yachtClubs = sources.filter((s: any) => s.data_key === "yacht_club");
  const charityBoards = sources.filter((s: any) => s.data_key === "charity_board");
  const wealthSignals = sources.filter((s: any) => s.data_key === "wealth_signal");

  // Nonprofit (IRS 990)
  const nonprofitRoles = sources.filter((s: any) => s.data_key === "nonprofit_role")
    .map((s: any) => { try { return JSON.parse(s.data_value); } catch { return null; } })
    .filter(Boolean);

  return (
    <div className="space-y-5">
      {/* ─── 5-Layer Intelligence Scores ─── */}
      <div className="rounded-xl p-5 border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-4" style={{ color: "var(--brass-500)" }}>
          Intelligence Layers
        </div>
        <div className="space-y-3">
          <ScoreBar label="Identity Confidence" score={intel.identity_score || 0} icon="🪪" desc="Name, employer, location verification" />
          <ScoreBar label="Capital Probability" score={intel.capital_score || 0} icon="💰" desc="Assets, donations, business ownership" />
          <ScoreBar label="Reputation Risk" score={intel.risk_score ?? 100} icon="🛡" desc="Sanctions, litigation, fraud — higher is cleaner" />
          <ScoreBar label="Digital Presence" score={intel.digital_score || 0} icon="🌐" desc="Social profiles, news, web mentions" />
          <ScoreBar label="Engagement Signal" score={intel.engagement_score || 0} icon="🤝" desc="Inquiry depth, response quality, affiliations" />
        </div>
      </div>

      {/* ─── Person Profile — Key Facts ─── */}
      <div className="rounded-xl p-5 border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--brass-500)" }}>
          📋 Discovered Profile
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
          <IntelField label="Occupation" value={occupationSrc?.data_value || "—"} bold={!!occupationSrc} />
          <IntelField label="Employer" value={employerSrc?.data_value || "—"} bold={!!employerSrc} />
          <IntelField label="Location"
            value={locationInfo.city ? `${locationInfo.city}, ${locationInfo.state} ${locationInfo.zip || ""}` : "—"}
            bold={!!locationSrc} />
          <IntelField label="Email Type"
            value={isBusinessEmail ? `Business (${domainInfo.domain || ""})` : domainTypeSrc ? "Personal / Freemail" : "—"}
            color={isBusinessEmail ? "#059669" : domainTypeSrc ? "#d97706" : undefined} />
          {domainInfo.company && domainInfo.company !== domainInfo.domain && (
            <IntelField label="Company (from email)" value={domainInfo.company} />
          )}
          {wikiSrc && <IntelField label="Notable Person" value="✓ Wikipedia entry" color="#3b82f6" />}
        </div>
        {!employerSrc && !occupationSrc && !locationSrc && (
          <div className="text-xs mt-2 py-2 px-3 rounded-lg" style={{ background: "var(--sand-50)", color: "var(--navy-400)" }}>
            💡 FEC data depends on political donation history. No donations found for this name.
          </div>
        )}
      </div>

      {/* ─── Social Media & Web Presence ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IntelCard icon={Globe} title="Social Media">
          {socialProfiles.length > 0 ? (
            <div className="space-y-2">
              {socialProfiles.map((p: any, i: number) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
                  <SocialIcon platform={p.key} />
                  <span className="text-sm font-semibold" style={{ color: "var(--sea-500)" }}>
                    {platformLabel(p.key)}
                  </span>
                  <ExternalLink className="w-3 h-3 ml-auto" style={{ color: "var(--navy-300)" }} />
                </a>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <EmptyField label="No confirmed social profiles found" />
              <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(leadName)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: "var(--sea-500)" }}>
                <Linkedin className="w-3 h-3" /> Search LinkedIn manually
              </a>
            </div>
          )}
        </IntelCard>

        <IntelCard icon={Activity} title="News & Media">
          {newsMentions.length > 0 ? (
            <div className="space-y-2">
              {newsMentions.slice(0, 4).map((n: any, i: number) => (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                  className="block py-1.5 hover:underline">
                  <div className="text-xs font-semibold" style={{ color: "var(--navy-700)" }}>{n.title?.substring(0, 80)}</div>
                  <div className="text-[10px]" style={{ color: "var(--navy-400)" }}>{n.source}</div>
                </a>
              ))}
            </div>
          ) : (
            <EmptyField label="No news articles found for this name" />
          )}
          {wikiSrc && (
            <div className="mt-2 text-xs p-2 rounded-lg" style={{ background: "rgba(59,130,246,0.06)" }}>
              <span className="font-bold" style={{ color: "#3b82f6" }}>Wikipedia:</span>{" "}
              <span style={{ color: "var(--navy-600)" }}>{wikiSrc.data_value?.substring(0, 200)}...</span>
            </div>
          )}
        </IntelCard>
      </div>

      {/* ─── Affiliations & Lifestyle ─── */}
      {(yachtClubs.length > 0 || charityBoards.length > 0 || nonprofitRoles.length > 0 || webTitles.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(yachtClubs.length > 0 || webTitles.length > 0) && (
            <IntelCard icon={Ship} title="Lifestyle & Affiliations">
              {yachtClubs.map((s: any, i: number) => (
                <div key={`yc${i}`} className="flex items-center gap-2 py-1">
                  <span className="text-lg">⛵</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--navy-700)" }}>{s.data_value}</span>
                </div>
              ))}
              {webTitles.map((s: any, i: number) => (
                <div key={`wt${i}`} className="flex items-center gap-2 py-1">
                  <Briefcase className="w-3.5 h-3.5" style={{ color: "var(--brass-400)" }} />
                  <span className="text-sm" style={{ color: "var(--navy-700)" }}>{s.data_value}</span>
                </div>
              ))}
              {webCompanies.length > 0 && (
                <div className="mt-1 text-xs" style={{ color: "var(--navy-400)" }}>
                  Companies: {webCompanies.map((s: any) => s.data_value).join(", ")}
                </div>
              )}
            </IntelCard>
          )}

          {(charityBoards.length > 0 || nonprofitRoles.length > 0) && (
            <IntelCard icon={Building2} title="Philanthropy & Nonprofits">
              {nonprofitRoles.map((np: any, i: number) => (
                <div key={`np${i}`} className="py-1.5 border-b last:border-0" style={{ borderColor: "var(--sand-200)" }}>
                  <div className="text-sm font-semibold" style={{ color: "var(--navy-700)" }}>{np.name}</div>
                  <div className="text-xs flex items-center gap-2" style={{ color: "var(--navy-500)" }}>
                    <span>{np.role}</span>
                    {np.compensation > 0 && (
                      <span className="font-bold" style={{ color: "#059669" }}>${np.compensation.toLocaleString()}/yr</span>
                    )}
                  </div>
                  {np.source_url && (
                    <a href={np.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: "var(--sea-500)" }}>
                      IRS 990 Filing <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              ))}
              {charityBoards.map((s: any, i: number) => (
                <div key={`cb${i}`} className="flex items-center gap-2 py-1">
                  <span className="text-xs">🏛</span>
                  <span className="text-sm" style={{ color: "var(--navy-700)" }}>Board: {s.data_value}</span>
                </div>
              ))}
            </IntelCard>
          )}
        </div>
      )}

      {/* ─── Wealth Signals ─── */}
      {wealthSignals.length > 0 && (
        <div className="rounded-xl p-4 border" style={{ borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.04)" }}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4" style={{ color: "#059669" }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#059669" }}>Wealth Signals</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {wealthSignals.map((s: any, i: number) => (
              <span key={i} className="text-sm px-3 py-1 rounded-full font-bold"
                style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>
                {s.data_value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Web Mentions ─── */}
      {webMentions.length > 0 && (
        <IntelCard icon={Globe} title={`Web Intelligence (${webMentions.length} results)`}>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {webMentions.map((w: any, i: number) => (
              <a key={i} href={w.url} target="_blank" rel="noopener noreferrer"
                className="block py-1.5 hover:bg-gray-50 dark:hover:bg-neutral-800 px-2 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                    style={{
                      background: w.category === "bio" ? "rgba(59,130,246,0.1)" :
                        w.category === "yacht" ? "rgba(16,185,129,0.1)" :
                        w.category === "charity" ? "rgba(168,85,247,0.1)" : "rgba(107,114,128,0.1)",
                      color: w.category === "bio" ? "#3b82f6" :
                        w.category === "yacht" ? "#059669" :
                        w.category === "charity" ? "#8b5cf6" : "#6b7280",
                    }}>
                    {w.category}
                  </span>
                  <span className="text-xs font-semibold truncate" style={{ color: "var(--navy-700)" }}>
                    {w.title?.substring(0, 80)}
                  </span>
                  <ExternalLink className="w-3 h-3 shrink-0 ml-auto" style={{ color: "var(--navy-300)" }} />
                </div>
                {w.snippet && (
                  <div className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--navy-400)" }}>
                    {w.snippet.substring(0, 120)}
                  </div>
                )}
              </a>
            ))}
          </div>
        </IntelCard>
      )}

      {/* ─── Financial Signals ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IntelCard icon={DollarSign} title="Political Donations (FEC)">
          {donationInfo.total ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold" style={{ color: "#059669" }}>
                  ${donationInfo.total?.toLocaleString()}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>
                  {donationInfo.count || 0} donations
                </span>
              </div>
              {donationDetails.slice(0, 3).map((d: any, i: number) => {
                try {
                  const dd = JSON.parse(d.data_value);
                  return (
                    <div key={i} className="text-xs py-1 border-t" style={{ borderColor: "var(--sand-200)" }}>
                      <span className="font-bold" style={{ color: "var(--navy-700)" }}>
                        ${dd.contribution_amount?.toLocaleString()}
                      </span>{" "}
                      <span style={{ color: "var(--navy-500)" }}>to {dd.committee_name}</span>
                      <span className="ml-1" style={{ color: "var(--navy-300)" }}>{dd.contribution_date}</span>
                    </div>
                  );
                } catch { return null; }
              })}
              <a href={`https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(leadName)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] flex items-center gap-1 mt-1" style={{ color: "var(--sea-500)" }}>
                View all on FEC.gov <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          ) : (
            <EmptyField label="No political donation records found" />
          )}
        </IntelCard>

        <div className="space-y-4">
          <IntelCard icon={Ship} title="Vessel Registrations (USCG)">
            {(capital.vessel_registrations || []).length > 0 ? (
              capital.vessel_registrations.map((v: any, i: number) => (
                <div key={i} className="py-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{v.name}</div>
                  {v.hin && <div className="text-xs text-gray-500">HIN: {v.hin}</div>}
                </div>
              ))
            ) : (
              <EmptyField label="No USCG vessel docs found" />
            )}
          </IntelCard>
          <IntelCard icon={Plane} title="Aircraft (FAA)">
            {(capital.aircraft_registrations || []).length > 0 ? (
              capital.aircraft_registrations.map((a: any, i: number) => (
                <div key={i} className="py-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">N{a.n_number}</div>
                  {a.type && <div className="text-xs text-gray-500">{a.type}</div>}
                </div>
              ))
            ) : (
              <EmptyField label="No FAA aircraft found" />
            )}
          </IntelCard>
        </div>
      </div>

      {/* ─── Business Registries ─── */}
      {((identity.corporate_roles || []).length > 0 || (identity.business_ownership || []).length > 0) && (
        <IntelCard icon={Building2} title="Business Registry Records">
          <div className="space-y-2">
            {(identity.corporate_roles || []).map((r: any, i: number) => (
              <div key={`r${i}`} className="py-1">
                <span className="text-sm font-semibold" style={{ color: "var(--navy-800)" }}>{r.title}</span>
                <span className="text-xs ml-2" style={{ color: "var(--navy-500)" }}>at {r.company}</span>
              </div>
            ))}
            {(identity.business_ownership || []).map((b: any, i: number) => (
              <div key={`b${i}`} className="py-1">
                <span className="text-sm font-semibold" style={{ color: "var(--navy-800)" }}>{b.company}</span>
                {b.jurisdiction && <span className="text-xs ml-2" style={{ color: "var(--navy-400)" }}>{b.jurisdiction}</span>}
              </div>
            ))}
          </div>
        </IntelCard>
      )}

      {/* ─── Web Intelligence: Yacht Clubs, Charity Boards, Wealth ─── */}
      {(() => {
        const yachtClubs = sources.filter((s: any) => s.data_key === "yacht_club");
        const charityBoards = sources.filter((s: any) => s.data_key === "charity_board");
        const nonprofitRoles = sources.filter((s: any) => s.data_key === "nonprofit_role");
        const wealthSignals = sources.filter((s: any) => s.data_key === "wealth_signal");
        const webMentions = sources.filter((s: any) => s.data_key === "web_mention");
        const webTitles = sources.filter((s: any) => s.data_key === "web_title");
        const webCompanies = sources.filter((s: any) => s.data_key === "web_company");
        const hasWebData = yachtClubs.length > 0 || charityBoards.length > 0 || nonprofitRoles.length > 0
          || wealthSignals.length > 0 || webMentions.length > 0 || webTitles.length > 0;
        if (!hasWebData) return null;
        return (
          <div className="space-y-4">
            {/* Executive roles & companies found on web */}
            {(webTitles.length > 0 || webCompanies.length > 0) && (
              <IntelCard icon={Briefcase} title="Web Intelligence — Roles & Companies">
                <div className="space-y-1.5">
                  {webTitles.map((s: any, i: number) => (
                    <div key={`wt${i}`} className="flex items-center gap-2 py-1">
                      <User className="w-3.5 h-3.5 shrink-0" style={{ color: "#6366f1" }} />
                      <span className="text-sm font-semibold" style={{ color: "var(--navy-800)" }}>{s.data_value}</span>
                    </div>
                  ))}
                  {webCompanies.map((s: any, i: number) => (
                    <div key={`wc${i}`} className="flex items-center gap-2 py-1">
                      <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#8b5cf6" }} />
                      <span className="text-sm" style={{ color: "var(--navy-700)" }}>{s.data_value}</span>
                    </div>
                  ))}
                </div>
              </IntelCard>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Yacht/Boat Clubs */}
              {yachtClubs.length > 0 && (
                <IntelCard icon={Ship} title="Yacht & Boat Club Memberships">
                  {yachtClubs.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <span className="text-sm font-semibold" style={{ color: "var(--sea-600)" }}>{s.data_value}</span>
                    </div>
                  ))}
                </IntelCard>
              )}

              {/* Charity & Foundation Boards */}
              {(charityBoards.length > 0 || nonprofitRoles.length > 0) && (
                <IntelCard icon={Building2} title="Philanthropy & Board Seats">
                  {nonprofitRoles.map((s: any, i: number) => {
                    try {
                      const d = JSON.parse(s.data_value);
                      return (
                        <div key={`np${i}`} className="py-1.5 border-b last:border-0" style={{ borderColor: "var(--sand-200)" }}>
                          <div className="text-sm font-semibold" style={{ color: "var(--navy-800)" }}>{d.name}</div>
                          <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: "var(--navy-500)" }}>
                            <span>{d.role}</span>
                            {d.compensation > 0 && <span className="font-bold" style={{ color: "#059669" }}>${d.compensation.toLocaleString()}/yr</span>}
                            {d.city && <span>{d.city}, {d.state}</span>}
                          </div>
                          {d.source_url && (
                            <a href={d.source_url} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] flex items-center gap-1 mt-1" style={{ color: "var(--sea-500)" }}>
                              View IRS 990 <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      );
                    } catch { return null; }
                  })}
                  {charityBoards.map((s: any, i: number) => (
                    <div key={`cb${i}`} className="py-1.5">
                      <span className="text-sm" style={{ color: "var(--navy-700)" }}>{s.data_value}</span>
                    </div>
                  ))}
                </IntelCard>
              )}
            </div>

            {/* Wealth Signals */}
            {wealthSignals.length > 0 && (
              <div className="rounded-xl p-4 border" style={{ borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.04)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4" style={{ color: "#059669" }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#059669" }}>Wealth Signals</span>
                </div>
                {wealthSignals.map((s: any, i: number) => (
                  <div key={i} className="text-sm py-1" style={{ color: "var(--navy-700)" }}>{s.data_value}</div>
                ))}
              </div>
            )}

            {/* Notable Web Mentions */}
            {webMentions.length > 0 && (
              <IntelCard icon={Globe} title="Notable Web Mentions">
                <div className="space-y-2">
                  {webMentions.slice(0, 6).map((s: any, i: number) => {
                    try {
                      const d = JSON.parse(s.data_value);
                      return (
                        <a key={i} href={s.source_url} target="_blank" rel="noopener noreferrer"
                          className="block py-1.5 hover:underline group">
                          <div className="text-xs font-semibold group-hover:underline" style={{ color: "var(--navy-700)" }}>
                            {d.title?.substring(0, 100)}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--navy-400)" }}>
                            {d.snippet?.substring(0, 120)}
                          </div>
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
                            style={{ background: categoryColor(d.category).bg, color: categoryColor(d.category).text }}>
                            {d.category}
                          </span>
                        </a>
                      );
                    } catch { return null; }
                  })}
                </div>
              </IntelCard>
            )}
          </div>
        );
      })()}

      {/* ─── Compliance & Risk ─── */}
      <div className="rounded-xl p-4" style={{
        background: risk.sanctions_flag ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)",
        border: `1px solid ${risk.sanctions_flag ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}`,
      }}>
        <div className="flex items-center gap-2 mb-2">
          {risk.sanctions_flag
            ? <XCircle className="w-4 h-4" style={{ color: "#ef4444" }} />
            : <CheckCircle className="w-4 h-4" style={{ color: "#059669" }} />}
          <span className="text-sm font-bold" style={{ color: risk.sanctions_flag ? "#ef4444" : "#059669" }}>
            {risk.sanctions_flag ? "⚠️ OFAC SANCTIONS MATCH — COMPLIANCE REVIEW REQUIRED" : "OFAC Sanctions: Clear"}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--navy-500)" }}>
          <span>Bankruptcy: {risk.bankruptcy_flag ? "⚠️ Found" : "None"}</span>
          <span>Fraud indicators: {(risk.fraud_indicators || []).length > 0 ? `⚠️ ${risk.fraud_indicators.length}` : "None"}</span>
          <span>Litigation: {risk.litigation_count || 0} cases</span>
        </div>
      </div>

      {/* ─── Score Breakdown ─── */}
      {breakdown.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>
            Score Breakdown
          </div>
          <div className="space-y-1">
            {breakdown.map((b: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg text-sm"
                style={{ background: i % 2 === 0 ? "var(--sand-50)" : "transparent" }}>
                <span className="font-mono text-xs w-10 text-right font-bold"
                  style={{ color: b.points > 0 ? "#059669" : "#ef4444" }}>
                  {b.points > 0 ? "+" : ""}{b.points}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase w-20 text-center shrink-0"
                  style={{
                    background: b.category === "identity" ? "rgba(59,130,246,0.1)" :
                      b.category === "capital" ? "rgba(16,185,129,0.1)" :
                      b.category === "risk" ? "rgba(239,68,68,0.1)" :
                      b.category === "digital" ? "rgba(168,85,247,0.1)" : "rgba(245,158,11,0.1)",
                    color: b.category === "identity" ? "#3b82f6" :
                      b.category === "capital" ? "#059669" :
                      b.category === "risk" ? "#ef4444" :
                      b.category === "digital" ? "#8b5cf6" : "#f59e0b",
                  }}>
                  {b.category}
                </span>
                <span className="font-medium" style={{ color: "var(--navy-700)" }}>{b.label}</span>
                {b.reason && <span className="text-xs ml-auto" style={{ color: "var(--navy-400)" }}>{b.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Sources ─── */}
      {sources.length > 0 && (
        <details className="group">
          <summary className="text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none"
            style={{ color: "var(--navy-400)" }}>
            {sources.length} Source{sources.length !== 1 ? "s" : ""} Collected — Click to expand
          </summary>
          <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
            {sources.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded"
                style={{ background: "var(--sand-50)" }}>
                <span className="font-bold uppercase w-16 shrink-0" style={{ color: "var(--navy-500)" }}>{s.source_type}</span>
                <span style={{ color: "var(--navy-600)" }}>{s.data_key}: {s.data_value?.substring(0, 80)}</span>
                {s.source_url && (
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0">
                    <ExternalLink className="w-3 h-3" style={{ color: "var(--sea-500)" }} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Disclaimer */}
      <div className="text-[10px] text-center py-1" style={{ color: "var(--navy-300)" }}>
        Generated from public sources. Not financial verification. Internal use only.
      </div>
    </div>
  );
}

/* ─── Small Helpers ─── */
function IntelCard({ icon: Icon, title, children }: {
  icon: typeof Shield; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4 border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: "var(--brass-400)" }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--navy-500)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function IntelField({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs" style={{ color: "var(--navy-400)" }}>{label}</span>
      <span className={`text-xs ${bold ? "font-bold" : "font-semibold"}`}
        style={{ color: color || "var(--navy-700)" }}>{value}</span>
    </div>
  );
}

function EmptyField({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <HelpCircle className="w-3.5 h-3.5" style={{ color: "var(--navy-300)" }} />
      <span className="text-xs" style={{ color: "var(--navy-400)" }}>{label}</span>
    </div>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  if (platform.includes("linkedin")) return <Linkedin className="w-4 h-4" style={{ color: "#0077B5" }} />;
  if (platform.includes("facebook")) return <Globe className="w-4 h-4" style={{ color: "#1877F2" }} />;
  if (platform.includes("instagram")) return <Globe className="w-4 h-4" style={{ color: "#E4405F" }} />;
  if (platform.includes("twitter")) return <Globe className="w-4 h-4" style={{ color: "#1DA1F2" }} />;
  return <Globe className="w-4 h-4" style={{ color: "var(--navy-400)" }} />;
}

function platformLabel(key: string): string {
  if (key.includes("linkedin")) return "LinkedIn";
  if (key.includes("facebook")) return "Facebook";
  if (key.includes("instagram")) return "Instagram";
  if (key.includes("twitter")) return "Twitter / X";
  return key;
}

function categoryColor(cat: string): { bg: string; text: string } {
  switch (cat) {
    case "bio": return { bg: "rgba(99,102,241,0.1)", text: "#6366f1" };
    case "press": return { bg: "rgba(59,130,246,0.1)", text: "#3b82f6" };
    case "board": return { bg: "rgba(139,92,246,0.1)", text: "#8b5cf6" };
    case "yacht": return { bg: "rgba(14,165,233,0.1)", text: "#0ea5e9" };
    case "charity": return { bg: "rgba(236,72,153,0.1)", text: "#ec4899" };
    case "realestate": return { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" };
    default: return { bg: "rgba(107,114,128,0.1)", text: "#6b7280" };
  }
}

function SocialLink({ label, url, color }: { label: string; url?: string; color: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
      style={{ background: `${color}15`, color }}>
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}

function SocialInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={`${label} URL`} className="form-input flex-1 text-sm" />
    </div>
  );
}

function ScoreBar({ label, score, icon, desc }: { label: string; score: number; icon: string; desc: string }) {
  const color = score >= 70 ? "#059669" : score >= 40 ? "#d97706" : score >= 1 ? "#ef4444" : "#9ca3af";
  const bg = score >= 70 ? "rgba(16,185,129,0.15)" : score >= 40 ? "rgba(217,119,6,0.15)" : score >= 1 ? "rgba(239,68,68,0.15)" : "rgba(156,163,175,0.1)";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-bold" style={{ color: "var(--navy-700)" }}>{label}</span>
        </div>
        <span className="text-xs font-bold" style={{ color }}>{score}/100</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--sand-100)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: color }} />
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--navy-400)" }}>{desc}</div>
    </div>
  );
}

function ProfileField({ label, value, sub, icon, highlight }: {
  label: string; value: string; sub?: string; icon?: string; highlight?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 py-1.5 ${highlight ? "px-3 rounded-lg" : ""}`}
      style={highlight ? { background: "rgba(16,185,129,0.05)" } : {}}>
      {icon && <span className="mt-0.5">{icon}</span>}
      <div className="flex-1 min-w-0">
        <span className="text-[10px] uppercase tracking-wider font-bold block" style={{ color: "var(--navy-400)" }}>
          {label}
        </span>
        <span className={`text-sm ${highlight ? "font-bold" : "font-semibold"}`}
          style={{ color: highlight ? "#059669" : "var(--navy-700)" }}>
          {value}
        </span>
        {sub && <span className="text-[10px] ml-2" style={{ color: "var(--navy-400)" }}>({sub})</span>}
      </div>
    </div>
  );
}
