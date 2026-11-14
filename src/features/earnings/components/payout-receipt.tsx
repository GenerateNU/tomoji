"use client";

import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { Modal } from "@/components/modal";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatPeriod } from "../lib/earnings-format";

export type PayoutPeriod = FunctionReturnType<typeof api.payouts.periods>["periods"][number];

/**
 * Figma "Receipt Modal": what a payout period earned and what reached the
 * creator's Stripe balance. Only figures Stripe reports are shown, so Stripe's
 * fee stands in for the design's platform fee (Tomoji takes none yet), and the
 * approval date for the transaction number.
 */
export function PayoutReceipt({
  period,
  onClose,
}: {
  period: PayoutPeriod | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={period !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Payout Information"
      className="max-w-[491px]"
    >
      {period && <ReceiptBody period={period} />}
    </Modal>
  );
}

function ReceiptBody({ period }: { period: PayoutPeriod }) {
  // A creator is paid in one currency unless they changed Stripe accounts.
  const labelled = (label: string, currency: string) =>
    period.settlements.length > 1 ? `${label} (${currency.toUpperCase()})` : label;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className="text-heading-sm text-gray-950">
          {period.earningPeriod
            ? formatPeriod(period.earningPeriod, true)
            : formatDate(period.earnedAt)}
        </p>
        <p className="text-body text-gray-600">
          {period.postCount} {period.postCount === 1 ? "Post" : "Posts"}
        </p>
      </div>

      <dl className="flex flex-col gap-4">
        <Row label="Gross Earnings">{formatMoney(period.amount)}</Row>
        <Row label="Cleared">{formatMoney(period.cleared)}</Row>
        <Row label="Pending">{formatMoney(period.amount - period.cleared)}</Row>
        {period.settlements.map(({ currency, stripeFee }) => (
          <Row key={`fee-${currency}`} label={labelled("Stripe Fee", currency)}>
            {formatCurrency(stripeFee, currency)}
          </Row>
        ))}
        {period.settlements.length === 0 ? (
          <Row label="Total Deposited" total>
            {formatMoney(0)}
          </Row>
        ) : (
          period.settlements.map(({ currency, creatorNet }) => (
            <Row key={`net-${currency}`} label={labelled("Total Deposited", currency)} total>
              {formatCurrency(creatorNet, currency)}
            </Row>
          ))
        )}
      </dl>

      <p className="text-body text-gray-600">
        {period.approvedAt === null
          ? "Waiting for the company to approve this period."
          : `Approved ${formatDate(period.approvedAt)}`}
      </p>
    </div>
  );
}

function Row({ label, total, children }: { label: string; total?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        total ? "text-body-lg font-medium text-gray-950" : "text-body text-gray-600",
      )}
    >
      <dt>{label}</dt>
      <dd className="text-gray-950">{children}</dd>
    </div>
  );
}
