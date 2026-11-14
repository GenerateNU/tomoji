"use client";

import { RequireAccount } from "@/features/users/components/require-account";
import { EarningsOverview } from "./earnings-overview";
import { PayoutHistory } from "./payout-history";
import { StripeSetupBanner } from "./stripe-setup-banner";

/** The creator's earnings: Stripe setup if unfinished, totals, top posts, and payout history. */
export function EarningsView() {
  return (
    <RequireAccount
      role="creator"
      next="/earnings"
      wrongRole="This page shows a creator's own earnings."
      loading="Loading your earnings…"
    >
      <div className="flex flex-col gap-10">
        <h1 className="text-heading-lg text-gray-950">Earnings</h1>
        <StripeSetupBanner />
        <div className="flex flex-col gap-12">
          <EarningsOverview />
          <hr className="border-gray-100" />
          <PayoutHistory />
        </div>
      </div>
    </RequireAccount>
  );
}
