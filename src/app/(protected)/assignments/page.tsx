import type { Metadata } from "next";
import { AssignmentsView } from "@/features/assignments/components/assignments-view";

export const metadata: Metadata = { title: "Assignments · Tomoji" };

/** Opens the creator's assignments workspace. */
export default function AssignmentsPage() {
  return <AssignmentsView />;
}
