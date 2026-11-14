import type { Metadata } from "next";
import { SubmissionsView } from "@/features/submissions/components/submissions-view";

export const metadata: Metadata = { title: "Submissions · Tomoji" };

/** Opens the company submissions queue. */
export default function SubmissionsPage() {
  return <SubmissionsView />;
}
