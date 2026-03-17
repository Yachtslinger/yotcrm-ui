// src/app/api/dropbox/browse/route.ts
// Lists folders and image files from a Dropbox path.
// Uses Dropbox API v2 with a long-lived access token stored in env.
//
// Environment variables needed (add to Railway):
//   DROPBOX_ACCESS_TOKEN  — a long-lived offline token for your Dropbox account
//
// To get a long-lived token:
//   1. Go to https://www.dropbox.com/developers/apps
//   2. Create an app → Full Dropbox access
//   3. In the app console, click "Generate access token" (under OAuth2)
//   4. Paste that token into Railway as DROPBOX_ACCESS_TOKEN
//
// GET /api/dropbox/browse?path=/Ocean%20King
// Returns { folders: string[], images: { name, url, thumbnailUrl }[] }

import { NextRequest, NextResponse } from "next/server";

const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

interface DropboxEntry {
  ".tag": "file" | "folder";
  name: string;
  path_lower: string;
  path_display: string;
}

interface DropboxListResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

interface DropboxThumbnailBatch {
  entries: {
    ".tag": "success" | "failure";
    metadata?: { name: string; path_lower: string };
    thumbnail?: string;
  }[];
}

export async function GET(req: NextRequest) {
  if (!DROPBOX_TOKEN) {
    return NextResponse.json(
      { error: "DROPBOX_ACCESS_TOKEN not set in Railway environment variables." },
      { status: 503 }
    );
  }

  const path = req.nextUrl.searchParams.get("path") || "";
  // Dropbox root is "" not "/"
  const dropboxPath = path === "/" ? "" : path;

  try {
    // List folder contents
    const listRes = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DROPBOX_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: dropboxPath,
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
      }),
    });

    if (!listRes.ok) {
      const err = await listRes.text();
      return NextResponse.json({ error: `Dropbox error: ${err}` }, { status: 502 });
    }

    const listData = (await listRes.json()) as DropboxListResult;

    const folders = listData.entries
      .filter((e) => e[".tag"] === "folder")
      .map((e) => ({ name: e.name, path: e.path_display }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const imageFiles = listData.entries.filter(
      (e) =>
        e[".tag"] === "file" &&
        /\.(jpe?g|png|webp|gif)$/i.test(e.name)
    );

    if (imageFiles.length === 0) {
      return NextResponse.json({ folders, images: [] });
    }

    // Get temporary links for images (batch — up to 25 at a time)
    const images: { name: string; path: string; url: string; thumbnailUrl: string }[] = [];

    // Get direct temporary links
    const linkChunks = chunk(imageFiles, 25);
    for (const batch of linkChunks) {
      await Promise.allSettled(
        batch.map(async (entry) => {
          try {
            const linkRes = await fetch(
              "https://api.dropboxapi.com/2/files/get_temporary_link",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${DROPBOX_TOKEN}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ path: entry.path_lower }),
              }
            );
            if (!linkRes.ok) return;
            const linkData = (await linkRes.json()) as { link: string };
            images.push({
              name: entry.name,
              path: entry.path_display,
              url: linkData.link,
              thumbnailUrl: linkData.link, // same URL works for thumbnails
            });
          } catch {
            // skip failed entries
          }
        })
      );
    }

    images.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ folders, images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Dropbox browse failed";
    console.error("[dropbox/browse]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
