import type { Metadata } from "next";
import { AssignmentDetailView } from "@/features/assignments/components/assignment-detail-view";

export const metadata: Metadata = { title: "Assignment · Tomoji" };

/** Opens a single assignment from the creator's workspace. */
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  return <AssignmentDetailView assignmentId={assignmentId} />;
}
