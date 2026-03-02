import { promises as fs } from "fs";
import path from "path";
import { CampaignData } from "./schema";

const DATA_DIR = path.join(process.cwd(), "data", "campaigns");

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function campaignPath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function saveCampaignData(data: CampaignData): Promise<string> {
  await ensureDir();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const file = campaignPath(id);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
  return id;
}

export async function loadCampaignData(id: string): Promise<CampaignData | null> {
  try {
    const file = campaignPath(id);
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as CampaignData;
  } catch {
    return null;
  }
}
