import type { Metadata } from "next";
import { EarningsView } from "@/features/earnings/components/earnings-view";

export const metadata: Metadata = { title: "Earnings · Tomoji" };

export default function EarningsPage() {
  return (
    <div className="w-full px-4 py-6 sm:px-8 lg:px-16 lg:pt-16 lg:pb-12">
      <EarningsView />
    </div>
  );
}
