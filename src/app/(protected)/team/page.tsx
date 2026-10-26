import type { Metadata } from "next";
import { CompanyMembers } from "@/features/team/components/company-members";

export const metadata: Metadata = { title: "Workspace members · Tomoji" };

/** Workspace directory with the existing company-admin invitation flow. */
export default function TeamPage() {
  return <CompanyMembers />;
}
