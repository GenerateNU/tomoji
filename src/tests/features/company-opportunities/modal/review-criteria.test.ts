import { describe, expect, it } from "vitest";
import {
  criteriaFromText,
  criteriaProblem,
  criteriaToText,
} from "@/features/company-opportunities/modal/lib/review-criteria";

describe("criteriaFromText", () => {
  it("makes one criterion per non-blank line, without list markers", () => {
    expect(
      criteriaFromText("- Disclose #ad\n\n  • Name the product  \n3. Show the demo", []),
    ).toEqual([
      { id: "criterion-1", description: "Disclose #ad" },
      { id: "criterion-2", description: "Name the product" },
      { id: "criterion-3", description: "Show the demo" },
    ]);
  });

  it("keeps the ids of unchanged criteria and never reuses an existing id", () => {
    const existing = [
      { id: "sponsorship", description: "Disclose #ad" },
      { id: "criterion-2", description: "Old line" },
    ];
    expect(criteriaFromText("New line\nDisclose #ad", existing)).toEqual([
      { id: "criterion-1", description: "New line" },
      { id: "sponsorship", description: "Disclose #ad" },
    ]);
  });

  it("returns an empty list for blank text", () => {
    expect(criteriaFromText("  \n ", [])).toEqual([]);
  });
});

describe("criteriaToText", () => {
  it("puts each criterion on its own line", () => {
    expect(
      criteriaToText([
        { id: "a", description: "One" },
        { id: "b", description: "Two" },
      ]),
    ).toBe("One\nTwo");
  });
});

describe("criteriaProblem", () => {
  it("requires criteria when AI review is on", () => {
    expect(criteriaProblem("", { required: true })).toMatch(/AI review/);
    expect(criteriaProblem("", { required: false })).toBeNull();
  });

  it("caps the number and length of criteria", () => {
    expect(criteriaProblem(Array.from({ length: 21 }, (_, i) => `c${i}`).join("\n"), {})).toMatch(
      /20/,
    );
    expect(criteriaProblem("x".repeat(1001), {})).toMatch(/1,000/);
  });

  it("rejects the same criterion twice", () => {
    expect(criteriaProblem("Same\n- Same", {})).toMatch(/twice/);
  });
});
