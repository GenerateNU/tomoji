import type { Metadata } from "next";
import { CompanyInvites } from "@/features/invites/components/company-invites";

export const metadata: Metadata = { title: "Team invitations · Tomoji" };

/** The company-admin invitation management route. */
export default function TeamInvitesPage() {
  return <CompanyInvites />;
}
