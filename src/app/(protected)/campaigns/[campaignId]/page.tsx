import type { Metadata } from "next";
import { CampaignDashboard } from "@/features/company-opportunities/components/campaign-dashboard";

export const metadata: Metadata = { title: "Campaign · Tomoji" };

/** One campaign's workspace, opening on its opportunities. */
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <CampaignDashboard campaignId={campaignId} />;
}
