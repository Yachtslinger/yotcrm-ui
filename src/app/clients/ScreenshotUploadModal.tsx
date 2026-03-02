"use client";

import React, { useState } from "react";
import { createWorker } from "tesseract.js";

interface ScreenshotUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface BoatInfo {
  make: string;
  model: string;
  year: string;
  length: string;
  price: string;
  location: string;
  url: string;
}

function extractEmail(text: string): string {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex);
  
  if (!matches) return "";
  
  const filtered = matches.filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes('denisonyachting.com') &&
           !lower.includes('boatwizard.com') &&
           !lower.includes('yatco.com') &&
           !lower.includes('leads@');
  });
  
  return filtered[0] || "";
}

function extractPhone(text: string): string {
  const phonePatterns = [
    /(?:Phone|Telephone|PHONE):\s*(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
    /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ];
  
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      // Clean up the phone number
      const phone = matches[0].replace(/(?:Phone|Telephone|PHONE):\s*/i, '').trim();
      return phone;
    }
  }
  
  return "";
}

function extractName(text: string): { firstName: string; lastName: string } {
  const namePatterns = [
    /(?:Name|NAME):\s*([A-Z][a-z]+)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:INDIVIDUAL PROSPECT):\s*Name:\s*([A-Z][a-z]+)\s+([A-Z][a-z]+)/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        firstName: match[1].trim(),
        lastName: match[2].trim(),
      };
    }
  }
  
  return { firstName: "", lastName: "" };
}

function extractBoatInfo(text: string): BoatInfo {
  const boatInfo: BoatInfo = {
    make: "",
    model: "",
    year: "",
    length: "",
    price: "",
    location: "",
    url: "",
  };

  // Extract year
  const yearMatch = text.match(/(?:Year|YEAR):\s*(\d{4})|(\d{4})\s+\d+(?:ft|')/i);
  if (yearMatch) boatInfo.year = yearMatch[1] || yearMatch[2];

  // Extract length
  const lengthMatch = text.match(/(?:Length|LOA):\s*(\d+)(?:ft|')?|(\d{4})\s+(\d+)(?:ft|')/i);
  if (lengthMatch) boatInfo.length = (lengthMatch[1] || lengthMatch[3]) + "ft";

  // Extract make and model
  const makePatterns = [
    /(?:Make|MAKE):\s*([A-Z][a-z\s]+)/i,
    /(?:Model description|Model):\s*([A-Z][a-zA-Z\s]+)/i,
  ];
  
  for (const pattern of makePatterns) {
    const match = text.match(pattern);
    if (match) {
      const fullName = match[1].trim();
      const parts = fullName.split(/\s+/);
      boatInfo.make = parts[0] || "";
      boatInfo.model = parts.slice(1).join(" ") || "";
      break;
    }
  }

  // Extract price
  const priceMatch = text.match(/(?:Asking Price|PRICE|Price):\s*\$?([\d,]+)/i);
  if (priceMatch) boatInfo.price = "$" + priceMatch[1];

  // Extract location
  const locationPatterns = [
    /(?:Boat Location|LOCATION|Location):\s*([^,\n]+(?:,\s*[A-Z]{2})?)/i,
    /(?:Address|City):\s*([^,\n]+)/i,
  ];
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      boatInfo.location = match[1].trim();
      break;
    }
  }

  // Extract URL
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) boatInfo.url = urlMatch[1];

  return boatInfo;
}

function extractMessage(text: string): string {
  // Extract the full customer message/comment
  const messagePatterns = [
    /(?:CUSTOMER COMMENTS|Customer Comments):\s*([^\n]+(?:\n[^\n]+)*?)(?=\*\*|$)/i,
    /(?:Message|MESSAGE):\s*([^\n]+)/i,
    /(?:Comments|COMMENTS):\s*([^\n]+)/i,
  ];
  
  for (const pattern of messagePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Get the full message, trim it
      return match[1].trim();
    }
  }
  
  return "";
}

export default function ScreenshotUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: ScreenshotUploadModalProps): React.ReactElement | null {
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [notes, setNotes] = useState("");
  const [boatMake, setBoatMake] = useState("");
  const [boatModel, setBoatModel] = useState("");
  const [boatYear, setBoatYear] = useState("");
  const [boatLength, setBoatLength] = useState("");
  const [boatPrice, setBoatPrice] = useState("");
  const [boatLocation, setBoatLocation] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    
    if (!selectedFile) return;

    setProcessing(true);
    setError("");
    
    try {
      const worker = await createWorker("eng");
      const { data: { text } } = await worker.recognize(selectedFile);
      await worker.terminate();

      console.log("[OCR] Extracted text:", text);

      // Extract all data
      const extractedEmail = extractEmail(text);
      const extractedPhone = extractPhone(text);
      const { firstName: fName, lastName: lName } = extractName(text);
      const boatInfo = extractBoatInfo(text);
      const message = extractMessage(text);

      // Set contact info
      if (extractedEmail) setEmail(extractedEmail);
      if (extractedPhone) setPhone(extractedPhone);
      if (fName) setFirstName(fName);
      if (lName) setLastName(lName);
      if (message) setNotes(message);

      // Set boat info
      if (boatInfo.make) setBoatMake(boatInfo.make);
      if (boatInfo.model) setBoatModel(boatInfo.model);
      if (boatInfo.year) setBoatYear(boatInfo.year);
      if (boatInfo.length) setBoatLength(boatInfo.length);
      if (boatInfo.price) setBoatPrice(boatInfo.price);
      if (boatInfo.location) setBoatLocation(boatInfo.location);
      if (boatInfo.url) setListingUrl(boatInfo.url);

      if (!extractedEmail && !extractedPhone && !fName) {
        setError("Could not extract contact info. Please enter manually.");
      }
    } catch (err) {
      console.error("[OCR] Error:", err);
      setError("OCR failed. Please enter contact info manually.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file || !email) {
      setError("Screenshot and email are required");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("email", email);
      if (phone) formData.append("phone", phone);
      if (firstName) formData.append("firstName", firstName);
      if (lastName) formData.append("lastName", lastName);
      if (notes) formData.append("notes", notes);
      if (boatMake) formData.append("boat_make", boatMake);
      if (boatModel) formData.append("boat_model", boatModel);
      if (boatYear) formData.append("boat_year", boatYear);
      if (boatLength) formData.append("boat_length", boatLength);
      if (boatPrice) formData.append("boat_price", boatPrice);
      if (boatLocation) formData.append("boat_location", boatLocation);
      if (listingUrl) formData.append("listing_url", listingUrl);

      const res = await fetch("/api/intake/screenshot", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.status === 409) {
        setError(`Duplicate: Lead with email ${email} already exists (ID: ${data.existingId})`);
        setUploading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      // Success - clear form
      setFile(null);
      setEmail("");
      setPhone("");
      setFirstName("");
      setLastName("");
      setNotes("");
      setBoatMake("");
      setBoatModel("");
      setBoatYear("");
      setBoatLength("");
      setBoatPrice("");
      setBoatLocation("");
      setListingUrl("");
      setUploading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-neutral-900 p-6 shadow-xl">
        <h2 className="text-xl font-bold mb-4">Capture Lead (Screenshot)</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Screenshot *</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
              disabled={uploading || processing}
            />
            {processing && (
              <p className="text-xs text-blue-600 mt-1">🔍 Reading screenshot...</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                disabled={uploading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                disabled={uploading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
              disabled={uploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
              disabled={uploading}
            />
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Boat Information</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Make</label>
                <input
                  type="text"
                  value={boatMake}
                  onChange={(e) => setBoatMake(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Model</label>
                <input
                  type="text"
                  value={boatModel}
                  onChange={(e) => setBoatModel(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                  disabled={uploading}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium mb-1">Year</label>
                <input
                  type="text"
                  value={boatYear}
                  onChange={(e) => setBoatYear(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Length</label>
                <input
                  type="text"
                  value={boatLength}
                  onChange={(e) => setBoatLength(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Price</label>
                <input
                  type="text"
                  value={boatPrice}
                  onChange={(e) => setBoatPrice(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                  disabled={uploading}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium mb-1">Location</label>
              <input
                type="text"
                value={boatLocation}
                onChange={(e) => setBoatLocation(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                disabled={uploading}
              />
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium mb-1">Listing URL</label>
              <input
                type="url"
                value={listingUrl}
                onChange={(e) => setListingUrl(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
                disabled={uploading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Message/Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 dark:border-gray-700 p-2 text-sm"
              disabled={uploading}
            />
          </div>

          {error && (
            <div className="rounded bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading || processing}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || processing || !file || !email}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : processing ? "Processing..." : "Capture Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
