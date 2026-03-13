import { notFound } from "next/navigation";
import { getProfileWithLinks, seedDefaultProfiles, seedPaoloProfiles } from "@/lib/cards/storage";
import ScanView from "./ScanView";

export const dynamic = "force-dynamic";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ brokerId: string; profileId: string }>;
}) {
  const { brokerId, profileId } = await params;
  if (brokerId === "will")  seedDefaultProfiles();
  if (brokerId === "paolo") seedPaoloProfiles();

  const profile = getProfileWithLinks(brokerId, profileId);
  if (!profile) notFound();

  return <ScanView profile={profile} brokerId={brokerId} />;
}
