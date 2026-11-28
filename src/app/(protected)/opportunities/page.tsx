import type { Metadata } from "next";
import { OpportunitiesPage } from "@/features/opportunities/components/opportunities-page";

export const metadata: Metadata = { title: "Opportunities · Tomoji" };

/** `?opportunity=<id>` opens that opportunity, e.g. from a notification. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ opportunity?: string | string[] }>;
}) {
  const { opportunity } = await searchParams;
  return (
    <OpportunitiesPage
      linkedOpportunityId={typeof opportunity === "string" ? opportunity : undefined}
    />
  );
}
