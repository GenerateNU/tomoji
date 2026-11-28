import type { Metadata } from "next";
import { ApplicationsView } from "@/features/applications/components/applications-view";

export const metadata: Metadata = { title: "Applications · Tomoji" };

export default function ApplicationsPage() {
  return (
    <div className="w-full px-4 py-6 sm:px-8 lg:px-16 lg:pt-16 lg:pb-12">
      <ApplicationsView />
    </div>
  );
}
