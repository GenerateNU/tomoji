import { DAY_MS } from "./time";

export const EARNING_PERIOD_MS = 7 * DAY_MS;
export const EARNING_WINDOW_MS = 30 * DAY_MS;

export type EarningPeriodInput = {
  startsAt: number;
  windowEndsAt: number;
  periodIndex: number;
  cutoffAt?: number;
};

export type EarningPeriod = {
  startsAt: number;
  endsAt: number;
  isFinal: boolean;
};

export type EarningsCalculationInput = {
  fixedFeeCents: number;
  cpmRateCents: number;
  paymentCapCents: number;
  previouslyRecordedEarningsCents: number;
  cumulativeEligibleViews: number | null;
};

type EarningsAmounts = {
  fixedEarnedCents: number;
  variableEarnedCents: number;
  totalEarnedCents: number;
  newFixedCents: number;
  newVariableCents: number;
  newPayoutCents: number;
  capApplied: boolean;
};

export type EarningsCalculation =
  | ({ status: "ready" } & EarningsAmounts)
  | ({ status: "pendingMetrics" } & Omit<
      EarningsAmounts,
      "variableEarnedCents" | "totalEarnedCents"
    > & { variableEarnedCents: null; totalEarnedCents: null })
  | {
      status: "needsAttention";
      reason:
        | "invalid_input"
        | "cap_below_fixed_fee"
        | "recorded_exceeds_cap"
        | "earnings_regressed";
      newPayoutCents: 0;
    };

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Returns a canonical weekly period, shortened by the stored window or cutoff.
 * An immediate cutoff returns a zero-duration first period so the caller can
 * settle the earned fixed fee without attaching an invalid payout earningPeriod.
 */
export function getEarningPeriod(input: EarningPeriodInput): EarningPeriod | null {
  const hasInvalidValues = ![input.startsAt, input.windowEndsAt, input.periodIndex].every(
    isNonnegativeSafeInteger,
  );
  const hasInvalidWindow = input.windowEndsAt <= input.startsAt;
  const isOutsideOriginalWindow =
    input.periodIndex >= Math.ceil((input.windowEndsAt - input.startsAt) / EARNING_PERIOD_MS);
  const hasInvalidCutoff =
    input.cutoffAt !== undefined &&
    (!isNonnegativeSafeInteger(input.cutoffAt) || input.cutoffAt < input.startsAt);
  if (hasInvalidValues || hasInvalidWindow || isOutsideOriginalWindow || hasInvalidCutoff) {
    throw new RangeError("Invalid earnings period input");
  }
  const effectiveEnd = Math.min(input.windowEndsAt, input.cutoffAt ?? input.windowEndsAt);
  if (effectiveEnd === input.startsAt && input.periodIndex === 0) {
    return { startsAt: input.startsAt, endsAt: effectiveEnd, isFinal: true };
  }
  // Adding a period near MAX_SAFE_INTEGER must not silently round a timestamp.
  const periodStart =
    BigInt(input.startsAt) + BigInt(input.periodIndex) * BigInt(EARNING_PERIOD_MS);
  const end = BigInt(effectiveEnd);
  // A valid period in the original window can fall after a cancellation or removal
  // cutoff. Return null because that period no longer earns; the input itself is valid.
  if (periodStart >= end) return null;
  const weeklyEnd = periodStart + BigInt(EARNING_PERIOD_MS);
  const periodEnd = weeklyEnd < end ? weeklyEnd : end;
  return {
    startsAt: Number(periodStart),
    endsAt: Number(periodEnd),
    isFinal: periodEnd === end,
  };
}

/** Computes an increment from cumulative earnings, regardless of collection status. */
export function calculateEarnings(input: EarningsCalculationInput): EarningsCalculation {
  const hasInvalidAmounts = ![
    input.fixedFeeCents,
    input.cpmRateCents,
    input.paymentCapCents,
    input.previouslyRecordedEarningsCents,
  ].every(isNonnegativeSafeInteger);
  const hasInvalidViewCount =
    input.cumulativeEligibleViews !== null &&
    !isNonnegativeSafeInteger(input.cumulativeEligibleViews);
  if (hasInvalidAmounts || hasInvalidViewCount) {
    return { status: "needsAttention", reason: "invalid_input", newPayoutCents: 0 };
  }
  if (input.paymentCapCents < input.fixedFeeCents) {
    return { status: "needsAttention", reason: "cap_below_fixed_fee", newPayoutCents: 0 };
  }
  if (input.previouslyRecordedEarningsCents > input.paymentCapCents) {
    return { status: "needsAttention", reason: "recorded_exceeds_cap", newPayoutCents: 0 };
  }
  const newFixedCents = Math.max(input.fixedFeeCents - input.previouslyRecordedEarningsCents, 0);
  if (
    input.cumulativeEligibleViews === null &&
    input.cpmRateCents > 0 &&
    input.paymentCapCents > input.fixedFeeCents
  ) {
    if (input.previouslyRecordedEarningsCents === input.paymentCapCents) {
      return {
        status: "ready",
        fixedEarnedCents: input.fixedFeeCents,
        variableEarnedCents: input.paymentCapCents - input.fixedFeeCents,
        totalEarnedCents: input.paymentCapCents,
        newFixedCents: 0,
        newVariableCents: 0,
        newPayoutCents: 0,
        capApplied: false,
      };
    }
    return {
      status: "pendingMetrics",
      fixedEarnedCents: input.fixedFeeCents,
      variableEarnedCents: null,
      totalEarnedCents: null,
      newFixedCents,
      newVariableCents: 0,
      newPayoutCents: newFixedCents,
      capApplied: false,
    };
  }
  // Multiplication may exceed the safe-number range even when the capped result
  // fits. BigInt division also floors once on cumulative views, carrying fractions.
  const variable =
    (BigInt(input.cpmRateCents) * BigInt(input.cumulativeEligibleViews ?? 0)) / BigInt(1000);
  const uncapped = BigInt(input.fixedFeeCents) + variable;
  const cap = BigInt(input.paymentCapCents);
  const totalEarnedCents = Number(uncapped < cap ? uncapped : cap);
  const newPayoutCents = totalEarnedCents - input.previouslyRecordedEarningsCents;
  if (newPayoutCents < 0) {
    return { status: "needsAttention", reason: "earnings_regressed", newPayoutCents: 0 };
  }
  return {
    status: "ready",
    fixedEarnedCents: input.fixedFeeCents,
    variableEarnedCents: totalEarnedCents - input.fixedFeeCents,
    totalEarnedCents,
    newFixedCents,
    newVariableCents: newPayoutCents - newFixedCents,
    newPayoutCents,
    capApplied: uncapped > cap,
  };
}
