import type { Metadata } from "next";
import { DisputesView } from "@/features/disputes/components/disputes-view";

export const metadata: Metadata = { title: "Disputes · Tomoji" };

export default function DisputesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-16">
      <DisputesView />
    </div>
  );
}
