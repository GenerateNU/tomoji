import type { Metadata } from "next";
import { ApplicationsView } from "@/features/applications/components/applications-view";

export const metadata: Metadata = { title: "Applications · Tomoji" };

export default function ApplicationsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-10">
      <ApplicationsView />
    </div>
  );
}
