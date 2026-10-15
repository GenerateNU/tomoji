import type { Metadata } from "next";
import { CampaignDraftForm } from "@/features/campaigns/components/campaign-draft-form";

export const metadata: Metadata = { title: "Create campaign · Tomoji" };

/** The admin-only campaign draft creation route. */
export default function NewCampaignPage() {
  return <CampaignDraftForm />;
}
