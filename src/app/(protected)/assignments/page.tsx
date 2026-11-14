import type { Metadata } from "next";
import { AssignmentsView } from "@/features/assignments/components/assignments-view";

export const metadata: Metadata = { title: "Assignments · Tomoji" };

/** Opens the creator's assignments workspace. */
export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return <AssignmentsView stage="draft" status={status} />;
}
