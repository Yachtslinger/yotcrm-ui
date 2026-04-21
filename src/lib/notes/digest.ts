import { getAllPendingFollowUps, type FollowUpRecord } from "@/lib/notes/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DigestItem = {
  id: number;
  leadName: string;
  title: string;
  dueDate: string | null;
  priority: string;
  bucket: "overdue" | "today" | "tomorrow" | "week";
  daysOverdue?: number;
};

// ─── Ranking ─────────────────────────────────────────────────────────────────

export function buildDigest(assignee: string): DigestItem[] {
  const all = getAllPendingFollowUps(assignee);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const items: DigestItem[] = [];

  for (const f of all) {
    const bucket = getBucket(f.due_date, todayStr);
    // Only include overdue, today, tomorrow, and high-priority this week
    if (!bucket) continue;
    if (bucket === "week" && f.priority !== "high") continue;

    items.push({
      id: f.id,
      leadName: f.lead_name || "Unknown",
      title: f.title,
      dueDate: f.due_date,
      priority: f.priority,
      bucket,
      daysOverdue: bucket === "overdue" && f.due_date
        ? Math.round((today.getTime() - new Date(f.due_date + "T00:00:00").getTime()) / 86400000)
        : undefined,
    });
  }

  // Sort: overdue (oldest first) → today high → today medium → tomorrow high → week high
  items.sort((a, b) => {
    const bucketOrder = { overdue: 0, today: 1, tomorrow: 2, week: 3 };
    if (bucketOrder[a.bucket] !== bucketOrder[b.bucket])
      return bucketOrder[a.bucket] - bucketOrder[b.bucket];
    // Within overdue: most overdue first
    if (a.bucket === "overdue")
      return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
    // Within same bucket: high priority first
    const pri = { high: 0, medium: 1, low: 2 };
    return (pri[a.priority as keyof typeof pri] ?? 2) - (pri[b.priority as keyof typeof pri] ?? 2);
  });

  // Hard cap at 8 items
  return items.slice(0, 8);
}

function getBucket(
  dueDate: string | null,
  todayStr: string
): DigestItem["bucket"] | null {
  if (!dueDate) return null;
  if (dueDate < todayStr) return "overdue";
  if (dueDate === todayStr) return "today";

  const tomorrow = new Date(todayStr);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  if (dueDate === tomorrowStr) return "tomorrow";

  const weekEnd = new Date(todayStr);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (dueDate <= weekEnd.toISOString().split("T")[0]) return "week";

  return null;
}

// ─── SMS Formatter ────────────────────────────────────────────────────────────

export function formatDigestSMS(items: DigestItem[], assignee: string): string {
  if (items.length === 0) {
    return `YotCRM · ${dayLabel()}\n\nNothing due today. Good time to add notes or check in with someone warm.`;
  }

  const lines: string[] = [];
  lines.push(`YotCRM · ${dayLabel()}`);
  lines.push("");

  let lastBucket = "";
  for (const item of items) {
    const bucketHead = bucketLabel(item.bucket);
    if (bucketHead !== lastBucket) {
      if (lastBucket) lines.push("");
      lines.push(bucketHead);
      lastBucket = bucketHead;
    }

    const name = item.leadName.split(" ")[0]; // first name only in SMS
    const task = truncate(item.title, 55);
    const overdueSuffix = item.daysOverdue
      ? ` (${item.daysOverdue}d overdue)`
      : "";
    const priorityStar = item.priority === "high" ? "★ " : "";
    lines.push(`· ${priorityStar}${name} — ${task}${overdueSuffix}`);
  }

  lines.push("");
  lines.push(`${items.length} task${items.length !== 1 ? "s" : ""}  yotcrm-production.up.railway.app`);

  return lines.join("\n");
}

function dayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function bucketLabel(bucket: DigestItem["bucket"]): string {
  return {
    overdue:  "Past due",
    today:    "Today",
    tomorrow: "Tomorrow",
    week:     "This week",
  }[bucket];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}
