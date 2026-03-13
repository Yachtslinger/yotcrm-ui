import { notFound } from "next/navigation";
import { getProfilesByBroker, getProfileWithLinks, seedDefaultProfiles, seedPaoloProfiles } from "@/lib/cards/storage";
import { isCardOwner } from "@/lib/cards/auth";
import CardView from "./CardView";

export const dynamic = "force-dynamic";

export default async function CardBrokerPage({
  params,
}: {
  params: Promise<{ brokerId: string }>;
}) {
  const { brokerId } = await params;
  if (brokerId === "will")  seedDefaultProfiles();
  if (brokerId === "paolo") seedPaoloProfiles();

  const profiles = getProfilesByBroker(brokerId);
  if (!profiles.length) notFound();

  // Load full detail (links + socials) for the first profile
  const initial = getProfileWithLinks(brokerId, profiles[0].profile_id);
  if (!initial) notFound();

  // Inject links/socials into the profiles list for the switcher
  const fullProfiles = profiles.map((p) =>
    p.id === initial.id ? initial : p
  );

  const owner = await isCardOwner();
  return <CardView profiles={fullProfiles} initialProfileId={initial.profile_id} brokerId={brokerId} isOwner={owner} />;
}
