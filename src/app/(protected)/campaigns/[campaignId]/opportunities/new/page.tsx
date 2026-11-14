import type { Metadata } from "next";
import { CreateOpportunityFlow } from "@/features/company-opportunities/components/create-opportunity-flow";

export const metadata: Metadata = { title: "Create opportunity · Tomoji" };

/** Adds an opportunity to one of the company's campaigns. */
export default async function NewOpportunityPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <CreateOpportunityFlow campaignId={campaignId} />;
}
