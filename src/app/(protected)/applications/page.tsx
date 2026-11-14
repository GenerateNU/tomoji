import type { Metadata } from "next";
import { ApplicationsView } from "@/features/applications/components/applications-view";

export const metadata: Metadata = { title: "Applications · Tomoji" };

export default function ApplicationsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <ApplicationsView />
    </div>
  );
}
