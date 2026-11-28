import type { Metadata } from "next";
import { DisputesView } from "@/features/disputes/components/disputes-view";

export const metadata: Metadata = { title: "Disputes · Tomoji" };

export default function DisputesPage() {
  return (
    <div className="w-full px-4 py-6 sm:px-8 lg:px-16 lg:pt-16 lg:pb-12">
      <DisputesView />
    </div>
  );
}
