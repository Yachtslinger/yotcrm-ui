"use client";
// src/components/brochures/DropboxImagePicker.tsx
//
// Appears only when editing an Ocean King brochure.
// Lets you browse Dropbox folders by vessel name and inject images
// directly into the brochure gallery.
//
// Usage:
//   <DropboxImagePicker
//     onAdd={(urls) => addImagesToVessel(urls)}
//   />

import React, { useState, useCallback, useEffect } from "react";
import { FolderOpen, ImageIcon, ChevronRight, ArrowLeft, Check, Plus, RefreshCw, X } from "lucide-react";

interface DropboxFolder {
  name: string;
  path: string;
}

interface DropboxImage {
  name: string;
  path: string;
  url: string;
  thumbnailUrl: string;
}

interface Props {
  onAdd: (imageUrls: string[]) => void;
  onClose: () => void;
  // Root path to start from — defaults to "" (Dropbox root)
  rootPath?: string;
}

export function DropboxImagePicker({ onAdd, onClose, rootPath = "" }: Props) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [history, setHistory] = useState<string[]>([]);
  const [folders, setFolders] = useState<DropboxFolder[]>([]);
  const [images, setImages] = useState<DropboxImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const browse = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/dropbox/browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Browse failed");
      setFolders(data.folders || []);
      setImages(data.images || []);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Dropbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { browse(rootPath); }, [browse, rootPath]);

  const openFolder = (path: string) => {
    setHistory(h => [...h, currentPath]);
    browse(path);
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    browse(prev ?? rootPath);
  };

  const toggleImage = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(images.map(i => i.url)));
  const clearAll  = () => setSelected(new Set());

  const handleAdd = () => {
    if (selected.size === 0) return;
    onAdd(Array.from(selected));
    onClose();
  };

  const pathLabel = currentPath
    ? currentPath.replace(/^\//, "")
    : "Dropbox root";

  return (
    // Full-screen modal overlay
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "rgba(2,8,16,.9)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ background: "var(--navy-950,#050d1a)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          {/* Back button */}
          {history.length > 0 && (
            <button onClick={goBack}
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--navy-400)" }}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Dropbox — Ocean King Photos
            </div>
            <div className="text-xs font-mono mt-0.5" style={{ color: "var(--navy-400)" }}>
              {pathLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "var(--brass-400,#b8933a)" }}>
              <Plus className="w-4 h-4" />
              Add {selected.size} image{selected.size !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: "var(--navy-400)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "var(--brass-400)" }} />
          </div>
        )}

        {error && (
          <div className="rounded-xl p-5 text-center" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
            <p className="text-sm font-medium" style={{ color: "#f87171" }}>{error}</p>
            {error.includes("DROPBOX_ACCESS_TOKEN") && (
              <p className="text-xs mt-2" style={{ color: "var(--navy-400)" }}>
                Add <code className="px-1 rounded" style={{ background: "rgba(255,255,255,.05)" }}>DROPBOX_ACCESS_TOKEN</code> to Railway environment variables.
              </p>
            )}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Folders */}
            {folders.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--navy-400)" }}>
                  Folders
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {folders.map(f => (
                    <button key={f.path} onClick={() => openFolder(f.path)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors"
                      style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                      <FolderOpen className="w-4 h-4 shrink-0" style={{ color: "var(--brass-400)" }} />
                      <span className="truncate" style={{ color: "var(--foreground)" }}>{f.name}</span>
                      <ChevronRight className="w-3 h-3 shrink-0 ml-auto" style={{ color: "var(--navy-400)" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Images */}
            {images.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--navy-400)" }}>
                    Images ({images.length})
                  </p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs" style={{ color: "var(--brass-400)" }}>Select all</button>
                    {selected.size > 0 && (
                      <button onClick={clearAll} className="text-xs" style={{ color: "var(--navy-400)" }}>Clear</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {images.map(img => {
                    const isSelected = selected.has(img.url);
                    return (
                      <button key={img.path} onClick={() => toggleImage(img.url)}
                        className="relative rounded-lg overflow-hidden aspect-video group transition-all"
                        style={{
                          border: isSelected ? "2px solid var(--brass-400)" : "2px solid transparent",
                          outline: isSelected ? "2px solid rgba(184,147,58,.3)" : "none",
                        }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.thumbnailUrl}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        {/* Selected overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center"
                            style={{ background: "rgba(184,147,58,.25)" }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center"
                              style={{ background: "var(--brass-400)" }}>
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                        {/* Hover filename */}
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[9px] truncate opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: "rgba(0,0,0,.65)", color: "#fff" }}>
                          {img.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {folders.length === 0 && images.length === 0 && (
              <div className="text-center py-16">
                <ImageIcon className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
                <p className="text-sm" style={{ color: "var(--navy-500)" }}>No folders or images found here</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {selected.size > 0 && (
        <div className="px-5 py-3 shrink-0 flex items-center justify-between"
          style={{ background: "var(--navy-950,#050d1a)", borderTop: "1px solid var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--navy-400)" }}>
            {selected.size} image{selected.size !== 1 ? "s" : ""} selected
          </span>
          <button onClick={handleAdd}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--brass-400,#b8933a)" }}>
            <Plus className="w-4 h-4" />
            Add to brochure
          </button>
        </div>
      )}
    </div>
  );
}
