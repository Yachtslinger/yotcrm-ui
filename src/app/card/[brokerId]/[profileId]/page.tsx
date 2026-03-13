import { notFound } from "next/navigation";
import { getProfilesByBroker, getProfileWithLinks, seedDefaultProfiles } from "@/lib/cards/storage";
import { isCardOwner } from "@/lib/cards/auth";
import CardView from "../CardView";

export const dynamic = "force-dynamic";

export default async function CardProfilePage({
  params,
}: {
  params: Promise<{ brokerId: string; profileId: string }>;
}) {
  const { brokerId, profileId } = await params;
  if (brokerId === "will") seedDefaultProfiles();

  const profiles = getProfilesByBroker(brokerId);
  if (!profiles.length) notFound();

  const initial = getProfileWithLinks(brokerId, profileId);
  if (!initial) notFound();

  const fullProfiles = profiles.map((p) =>
    p.id === initial.id ? initial : p
  );

  const owner = await isCardOwner();
  return <CardView profiles={fullProfiles} initialProfileId={profileId} brokerId={brokerId} isOwner={owner} />;
}
