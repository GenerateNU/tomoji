import { describe, expect, it } from "vitest";
import { deliverableRules } from "@/features/company-opportunities/modal/lib/deliverable-rules";

const NOW = 1_800_000_000_000;
const base = {
  opportunityStatus: "open",
  campaignStatus: "open",
  deadline: NOW + 1000,
  hasAssignments: false,
  count: 2,
  now: NOW,
} as const;

describe("deliverableRules", () => {
  it("allows everything on an open opportunity no creator has joined", () => {
    expect(deliverableRules(base)).toEqual({
      canAdd: true,
      canChange: true,
      canRemove: true,
    });
  });

  it("locks edits and removals, but not additions, once a creator is assigned", () => {
    const rules = deliverableRules({ ...base, hasAssignments: true });
    expect(rules.canAdd).toBe(true);
    expect(rules.canChange).toBe(false);
    expect(rules.canRemove).toBe(false);
    expect(rules.changeReason).toMatch(/locked/);
  });

  it("treats an unknown assignment state as locked until it loads", () => {
    const rules = deliverableRules({ ...base, hasAssignments: undefined });
    expect(rules.canChange).toBe(false);
    expect(rules.canAdd).toBe(true);
  });

  it("keeps the last assignment of a published opportunity", () => {
    const rules = deliverableRules({ ...base, count: 1 });
    expect(rules.canChange).toBe(true);
    expect(rules.canRemove).toBe(false);
    expect(rules.removeReason).toMatch(/at least one/);
    expect(deliverableRules({ ...base, count: 1, opportunityStatus: "draft" }).canRemove).toBe(
      true,
    );
  });

  it("stops adding at the limit", () => {
    const rules = deliverableRules({ ...base, count: 20 });
    expect(rules.canAdd).toBe(false);
    expect(rules.addReason).toMatch(/20/);
  });

  it("freezes a closed opportunity or campaign", () => {
    for (const closed of [
      { ...base, opportunityStatus: "closed" },
      { ...base, campaignStatus: "closed" },
    ] as const) {
      const rules = deliverableRules(closed);
      expect(rules).toMatchObject({ canAdd: false, canChange: false, canRemove: false });
      expect(rules.addReason).toMatch(/closed/);
    }
  });

  it("freezes a published opportunity past its deadline, but not a draft", () => {
    const late = { ...base, deadline: NOW - 1 };
    expect(deliverableRules(late)).toMatchObject({ canAdd: false, canChange: false });
    expect(deliverableRules({ ...late, opportunityStatus: "draft" }).canAdd).toBe(true);
  });
});
