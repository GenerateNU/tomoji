import type { Metadata } from "next";
import { EarningsView } from "@/features/earnings/components/earnings-view";

export const metadata: Metadata = { title: "Earnings · Tomoji" };

export default function EarningsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <EarningsView />
    </div>
  );
}
