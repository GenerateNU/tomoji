import type { Metadata } from "next";
import { CampaignList } from "@/features/campaigns/components/campaign-list";

export const metadata: Metadata = { title: "Campaigns · Tomoji" };

/** The company-scoped campaign listing route. */
export default function CampaignsPage() {
  return <CampaignList />;
}
