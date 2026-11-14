import type { Metadata } from "next";
import { AssignmentDetailView } from "@/features/assignments/components/assignment-detail-view";

export const metadata: Metadata = { title: "Assignment · Tomoji" };

/** Opens a single assignment from the creator's workspace. */
export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ assignmentId }, { status }] = await Promise.all([params, searchParams]);
  return <AssignmentDetailView assignmentId={assignmentId} status={status} />;
}
