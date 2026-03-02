import { MediaAsset } from "../campaign/schema";

type MediaRules = {
  disallowPatterns?: RegExp[];
  minWidth?: number;
  minHeight?: number;
};

const DEFAULT_RULES: Required<MediaRules> = {
  disallowPatterns: [/flag/i, /emoji/i, /icon/i, /placeholder/i],
  minWidth: 900,
  minHeight: 500,
};

export function pickHeroImage(candidates: MediaAsset[], rules: MediaRules = {}): MediaAsset {
  const merged = { ...DEFAULT_RULES, ...rules };
  const scored = candidates
    .filter((asset) => asset && asset.src)
    .filter((asset) => !merged.disallowPatterns.some((re) => re.test(asset.src)))
    .filter((asset) => asset.width >= merged.minWidth && asset.height >= merged.minHeight)
    .map((asset) => ({ asset, score: scoreAsset(asset) }))
    .sort((a, b) => b.score - a.score);

  return (
    scored[0]?.asset || {
      src: "https://via.placeholder.com/1200x675/0B1A2B/FFFFFF?text=Denison",
      width: 1200,
      height: 675,
      alt: "Denison Placeholder",
      tags: ["hero"],
    }
  );
}

function scoreAsset(asset: MediaAsset): number {
  let score = 0;
  const ratio = asset.width / asset.height;
  if (ratio >= 1.3 && ratio <= 1.9) score += 20;
  if (asset.tags?.includes("hero")) score += 40;
  if (asset.tags?.includes("exterior")) score += 25;
  if (asset.tags?.includes("interior")) score += 10;
  score += Math.min(asset.width, 1600) / 100;
  return score;
}
