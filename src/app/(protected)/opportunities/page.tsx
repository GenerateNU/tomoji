import type { Metadata } from "next";
import { OpportunitiesPage } from "@/features/opportunities/components/opportunities-page";

export const metadata: Metadata = { title: "Opportunities · Tomoji" };

export default function Page() {
  return <OpportunitiesPage />;
}
