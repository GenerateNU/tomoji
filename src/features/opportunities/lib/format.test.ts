import { describe, expect, it } from "vitest";
import { formatCompensation, formatDeadline } from "./format";

describe("formatCompensation", () => {
  it("lists the fee and CPM rate, leaving out the payment cap", () => {
    expect(formatCompensation({ fixedFeeCents: 30000, cpmRateCents: 550 })).toBe(
      "$300 • $5.50 CPM",
    );
  });

  it("omits zero-valued terms", () => {
    expect(formatCompensation({ fixedFeeCents: 30000, cpmRateCents: 0 })).toBe("$300");
    expect(formatCompensation({ fixedFeeCents: 0, cpmRateCents: 400 })).toBe("$4 CPM");
  });

  it("says unpaid when every term is zero", () => {
    expect(formatCompensation({ fixedFeeCents: 0, cpmRateCents: 0 })).toBe("Unpaid");
  });
});

describe("formatDeadline", () => {
  it("shows the month and day in the given time zone", () => {
    const deadline = Date.UTC(2026, 9, 15, 23, 30);
    expect(formatDeadline(deadline, "UTC")).toBe("October 15");
    expect(formatDeadline(deadline, "Asia/Tokyo")).toBe("October 16");
  });
});
