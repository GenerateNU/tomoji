import { expect, test } from "vitest";
import {
  calculateEarnings,
  EARNING_WINDOW_MS,
  getEarningPeriod,
  type EarningsCalculationInput,
} from "../../lib/earningsCalculator";
import { DAY_MS } from "../../lib/time";

function example(overrides: Partial<EarningsCalculationInput> = {}): EarningsCalculationInput {
  return {
    fixedFeeCents: 10000,
    cpmRateCents: 10000,
    paymentCapCents: 20000,
    previouslyRecordedEarningsCents: 0,
    cumulativeEligibleViews: 0,
    ...overrides,
  };
}

test("the first settlement includes the fixed fee even with zero views", () => {
  expect(
    calculateEarnings({
      fixedFeeCents: 10000,
      cpmRateCents: 10000,
      paymentCapCents: 20000,
      previouslyRecordedEarningsCents: 0,
      cumulativeEligibleViews: 0,
    }),
  ).toMatchObject({
    status: "ready",
    fixedEarnedCents: 10000,
    variableEarnedCents: 0,
    totalEarnedCents: 10000,
    newFixedCents: 10000,
    newVariableCents: 0,
    newPayoutCents: 10000,
  });
});

test("weekly increments pay the fixed fee once and cap total earnings", () => {
  let previouslyRecordedEarningsCents = 0;
  const increments: number[] = [];
  const fixedIncrements: number[] = [];
  for (const cumulativeEligibleViews of [100, 300, 600, 900, 1200]) {
    const result = calculateEarnings(
      example({
        previouslyRecordedEarningsCents,
        cumulativeEligibleViews,
      }),
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected complete calculation");
    increments.push(result.newPayoutCents);
    fixedIncrements.push(result.newFixedCents);
    previouslyRecordedEarningsCents += result.newPayoutCents;
  }
  expect(increments).toEqual([11000, 2000, 3000, 3000, 1000]);
  expect(fixedIncrements).toEqual([10000, 0, 0, 0, 0]);
  expect(previouslyRecordedEarningsCents).toBe(20000);
  expect(
    calculateEarnings(
      example({
        previouslyRecordedEarningsCents,
        cumulativeEligibleViews: 1_000_000,
      }),
    ),
  ).toMatchObject({ status: "ready", newPayoutCents: 0, capApplied: true });
});

test("fractional cents accumulate across periods and CPM divides by one thousand", () => {
  const terms = example({ fixedFeeCents: 0, cpmRateCents: 1, paymentCapCents: 100 });
  expect(calculateEarnings({ ...terms, cumulativeEligibleViews: 600 })).toMatchObject({
    status: "ready",
    newPayoutCents: 0,
  });
  expect(calculateEarnings({ ...terms, cumulativeEligibleViews: 1200 })).toMatchObject({
    status: "ready",
    newPayoutCents: 1,
  });
  expect(
    calculateEarnings({
      ...terms,
      cumulativeEligibleViews: 1800,
      previouslyRecordedEarningsCents: 1,
    }),
  ).toMatchObject({ status: "ready", newPayoutCents: 0 });
  expect(
    calculateEarnings({
      ...terms,
      cumulativeEligibleViews: 2000,
      previouslyRecordedEarningsCents: 1,
    }),
  ).toMatchObject({ status: "ready", newPayoutCents: 1 });
});

test("large intermediate products retain integer precision before applying the cap", () => {
  expect(
    calculateEarnings(
      example({
        fixedFeeCents: 0,
        cpmRateCents: Number.MAX_SAFE_INTEGER,
        paymentCapCents: Number.MAX_SAFE_INTEGER,
        cumulativeEligibleViews: 999,
      }),
    ),
  ).toMatchObject({ status: "ready", newPayoutCents: 8998192055486250 });
  expect(
    calculateEarnings(
      example({
        fixedFeeCents: 1,
        cpmRateCents: Number.MAX_SAFE_INTEGER,
        paymentCapCents: Number.MAX_SAFE_INTEGER,
        cumulativeEligibleViews: Number.MAX_SAFE_INTEGER,
      }),
    ),
  ).toMatchObject({
    status: "ready",
    newFixedCents: 1,
    newPayoutCents: Number.MAX_SAFE_INTEGER,
    capApplied: true,
  });
});

test("periods stay anchored to verification and include the final partial period", () => {
  const startsAt = 1740000000123;
  const windowEndsAt = startsAt + EARNING_WINDOW_MS;
  const periods = [0, 1, 2, 3, 4].map((periodIndex) =>
    getEarningPeriod({ startsAt, windowEndsAt, periodIndex }),
  );
  expect(periods).toEqual([
    { startsAt, endsAt: startsAt + 7 * DAY_MS, isFinal: false },
    { startsAt: startsAt + 7 * DAY_MS, endsAt: startsAt + 14 * DAY_MS, isFinal: false },
    { startsAt: startsAt + 14 * DAY_MS, endsAt: startsAt + 21 * DAY_MS, isFinal: false },
    { startsAt: startsAt + 21 * DAY_MS, endsAt: startsAt + 28 * DAY_MS, isFinal: false },
    { startsAt: startsAt + 28 * DAY_MS, endsAt: windowEndsAt, isFinal: true },
  ]);
});

test("a cancellation or removal cuts off only the final period", () => {
  const startsAt = 1740000000123;
  const windowEndsAt = startsAt + EARNING_WINDOW_MS;
  const cutoffAt = startsAt + 10 * DAY_MS;
  expect(getEarningPeriod({ startsAt, windowEndsAt, cutoffAt, periodIndex: 0 })).toEqual({
    startsAt,
    endsAt: startsAt + 7 * DAY_MS,
    isFinal: false,
  });
  expect(getEarningPeriod({ startsAt, windowEndsAt, cutoffAt, periodIndex: 1 })).toEqual({
    startsAt: startsAt + 7 * DAY_MS,
    endsAt: cutoffAt,
    isFinal: true,
  });
  expect(getEarningPeriod({ startsAt, windowEndsAt, cutoffAt, periodIndex: 2 })).toBeNull();
  expect(
    getEarningPeriod({
      startsAt,
      windowEndsAt,
      cutoffAt: startsAt + 7 * DAY_MS,
      periodIndex: 0,
    }),
  ).toEqual({ startsAt, endsAt: startsAt + 7 * DAY_MS, isFinal: true });
  expect(
    getEarningPeriod({
      startsAt,
      windowEndsAt,
      cutoffAt: startsAt + 7 * DAY_MS,
      periodIndex: 1,
    }),
  ).toBeNull();
});

test("an immediate cutoff retains the fixed-fee settlement without inventing an elapsed period", () => {
  const startsAt = 1740000000123;
  const windowEndsAt = startsAt + EARNING_WINDOW_MS;
  expect(getEarningPeriod({ startsAt, windowEndsAt, cutoffAt: startsAt, periodIndex: 0 })).toEqual({
    startsAt,
    endsAt: startsAt,
    isFinal: true,
  });
  expect(
    getEarningPeriod({ startsAt, windowEndsAt, cutoffAt: startsAt, periodIndex: 1 }),
  ).toBeNull();
});

test("period calculation rejects invalid timestamps and indexes before arithmetic", () => {
  const valid = { startsAt: 1000, windowEndsAt: 1000 + EARNING_WINDOW_MS, periodIndex: 0 };
  for (const field of ["startsAt", "windowEndsAt", "cutoffAt", "periodIndex"] as const) {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => getEarningPeriod({ ...valid, [field]: value }), `${field}: ${value}`).toThrow(
        RangeError,
      );
    }
  }
  expect(() => getEarningPeriod({ ...valid, cutoffAt: 999 })).toThrow(RangeError);
  expect(() => getEarningPeriod({ ...valid, windowEndsAt: valid.startsAt })).toThrow(RangeError);
  expect(() => getEarningPeriod({ ...valid, periodIndex: 5 })).toThrow(RangeError);
});

test("period end arithmetic remains safe near the maximum integer timestamp", () => {
  const startsAt = Number.MAX_SAFE_INTEGER - EARNING_WINDOW_MS;
  expect(
    getEarningPeriod({
      startsAt,
      windowEndsAt: Number.MAX_SAFE_INTEGER,
      periodIndex: 4,
    }),
  ).toEqual({
    startsAt: Number.MAX_SAFE_INTEGER - 2 * DAY_MS,
    endsAt: Number.MAX_SAFE_INTEGER,
    isFinal: true,
  });
  expect(
    getEarningPeriod({
      startsAt: Number.MAX_SAFE_INTEGER - 1,
      windowEndsAt: Number.MAX_SAFE_INTEGER,
      periodIndex: 0,
    }),
  ).toEqual({
    startsAt: Number.MAX_SAFE_INTEGER - 1,
    endsAt: Number.MAX_SAFE_INTEGER,
    isFinal: true,
  });
});

test("period bounds come from the stored window rather than the current default duration", () => {
  const startsAt = 1740000000123;
  const windowEndsAt = startsAt + 36 * DAY_MS;
  expect(getEarningPeriod({ startsAt, windowEndsAt, periodIndex: 5 })).toEqual({
    startsAt: startsAt + 35 * DAY_MS,
    endsAt: windowEndsAt,
    isFinal: true,
  });
  expect(() =>
    getEarningPeriod({ startsAt, windowEndsAt: startsAt + 14 * DAY_MS, periodIndex: 2 }),
  ).toThrow(RangeError);
});

test("missing view evidence releases the known fixed fee without declaring variable earnings zero", () => {
  expect(calculateEarnings(example({ cumulativeEligibleViews: null }))).toEqual({
    status: "pendingMetrics",
    fixedEarnedCents: 10000,
    variableEarnedCents: null,
    totalEarnedCents: null,
    newFixedCents: 10000,
    newVariableCents: 0,
    newPayoutCents: 10000,
    capApplied: false,
  });
  expect(
    calculateEarnings(
      example({ cumulativeEligibleViews: null, previouslyRecordedEarningsCents: 11000 }),
    ),
  ).toMatchObject({ status: "pendingMetrics", newFixedCents: 0, newPayoutCents: 0 });
});

test("fixed-only or fully capped compensation does not wait for irrelevant view metrics", () => {
  expect(
    calculateEarnings(example({ cpmRateCents: 0, cumulativeEligibleViews: null })),
  ).toMatchObject({
    status: "ready",
    totalEarnedCents: 10000,
    newPayoutCents: 10000,
  });
  expect(
    calculateEarnings(example({ paymentCapCents: 10000, cumulativeEligibleViews: null })),
  ).toMatchObject({ status: "ready", totalEarnedCents: 10000, newPayoutCents: 10000 });
  expect(
    calculateEarnings(
      example({ previouslyRecordedEarningsCents: 20000, cumulativeEligibleViews: null }),
    ),
  ).toMatchObject({ status: "ready", totalEarnedCents: 20000, newPayoutCents: 0 });
});

test("invalid inputs never become payable amounts or throw arithmetic conversion errors", () => {
  const fields = [
    "fixedFeeCents",
    "cpmRateCents",
    "paymentCapCents",
    "previouslyRecordedEarningsCents",
    "cumulativeEligibleViews",
  ] as const;
  for (const field of fields) {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(calculateEarnings(example({ [field]: value })), `${field}: ${value}`).toEqual({
        status: "needsAttention",
        reason: "invalid_input",
        newPayoutCents: 0,
      });
    }
  }
});

test("inconsistent compensation and existing obligations require reconciliation", () => {
  expect(calculateEarnings(example({ paymentCapCents: 9999 }))).toEqual({
    status: "needsAttention",
    reason: "cap_below_fixed_fee",
    newPayoutCents: 0,
  });
  expect(calculateEarnings(example({ previouslyRecordedEarningsCents: 20001 }))).toEqual({
    status: "needsAttention",
    reason: "recorded_exceeds_cap",
    newPayoutCents: 0,
  });
  expect(
    calculateEarnings(
      example({ previouslyRecordedEarningsCents: 11000, cumulativeEligibleViews: 50 }),
    ),
  ).toEqual({ status: "needsAttention", reason: "earnings_regressed", newPayoutCents: 0 });
  expect(
    calculateEarnings(
      example({
        cpmRateCents: 0,
        previouslyRecordedEarningsCents: 20000,
        cumulativeEligibleViews: null,
      }),
    ),
  ).toEqual({ status: "needsAttention", reason: "earnings_regressed", newPayoutCents: 0 });
});
