import type { Metadata } from "next";
import { CompanyMembers } from "@/features/team/components/company-members";

export const metadata: Metadata = { title: "Workspace members · Tomoji" };

/** Workspace directory and company-admin invitation management. */
export default function TeamPage() {
  return <CompanyMembers />;
}
