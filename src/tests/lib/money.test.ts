import { describe, expect, test } from "vitest";
import { formatCompensation, formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  test.each([
    [60_000, "$600"],
    [350, "$3.50"],
    [1_050, "$10.50"],
    [100_000, "$1,000"],
    [0, "$0"],
  ])("%i cents is %s", (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });
});

describe("formatCompensation", () => {
  const none = { fixedFeeCents: 0, cpmRateCents: 0, paymentCapCents: 0 };

  test.each([
    [{ ...none, fixedFeeCents: 65_000 }, "$650"],
    [{ ...none, fixedFeeCents: 1_050 }, "$10.50"],
    [{ ...none, cpmRateCents: 400 }, "$4 CPM"],
    [{ ...none, cpmRateCents: 300, paymentCapCents: 59_000 }, "$3 CPM (up to $590)"],
    [
      { fixedFeeCents: 3_000, cpmRateCents: 500, paymentCapCents: 100_000 },
      "$30 + $5 CPM (up to $1,000)",
    ],
    [none, "Unpaid"],
  ])("%j is %s", (terms, expected) => {
    expect(formatCompensation(terms)).toBe(expected);
  });

  // The cap limits a per-view payout, so it says nothing without a CPM.
  test("ignores a cap when there is no CPM to cap", () => {
    expect(formatCompensation({ ...none, fixedFeeCents: 10_000, paymentCapCents: 50_000 })).toBe(
      "$100",
    );
  });

  // The two feeds used to disagree on this, which is why it is shared now.
  test("reads the same wherever it is rendered", () => {
    const terms = { fixedFeeCents: 30_000, cpmRateCents: 550, paymentCapCents: 200_000 };
    expect(formatCompensation(terms)).toBe("$300 + $5.50 CPM (up to $2,000)");
  });
});
