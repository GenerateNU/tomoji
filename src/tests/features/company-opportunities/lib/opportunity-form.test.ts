import { describe, expect, it } from "vitest";
import {
  EMPTY_OPPORTUNITY_FORM,
  opportunityFormValues,
  parseOpportunityForm,
  parseOpportunityUpdate,
  validateOpportunityStep,
  type OpportunityFormValues,
} from "@/features/company-opportunities/lib/opportunity-form";

const HALF_HOUR = 1_800_000;
// Noon local time on Nov 14 2026.
const now = new Date(2026, 10, 14, 12).getTime();

const filled: OpportunityFormValues = {
  ...EMPTY_OPPORTUNITY_FORM,
  title: "  Opus 5.5 - Web Dev ",
  description: "Build a web app with Claude.",
  deadlineDate: "2026-12-01",
  isOpenToAll: false,
  contentRequirements: "Post a thread\nTag @claudeai",
  maxSlots: "10",
  niches: ["technology"],
  skills: ["web-development"],
  languages: [],
  minFollowerRange: "10k-50k",
  productAccessLink: "",
  fixedFee: "300",
  cpmRate: "3.50",
  paymentCap: "2000",
  reviewPolicy: "We review within 3 days.",
  usesAiReview: false,
  deliverables: [{ title: "X thread", description: "A thread about the build", criteria: "" }],
};

describe("parseOpportunityForm", () => {
  it("converts the form into create arguments", () => {
    const result = parseOpportunityForm(filled, { now });
    expect(result.errors).toBeUndefined();
    const input = result.input!;
    expect(input).toMatchObject({
      title: "Opus 5.5 - Web Dev",
      isGated: true,
      maxSlots: 10,
      fixedFeeCents: 30_000,
      cpmRateCents: 350,
      paymentCapCents: 200_000,
      minFollowerRange: "10k-50k",
      niches: ["technology"],
      usesAiReviewDefault: false,
      deliverables: [{ title: "X thread", description: "A thread about the build" }],
    });
    expect(input).not.toHaveProperty("productAccessLink");
  });

  it("puts the deadline at the end of the chosen day on the half-hour grid", () => {
    const { input } = parseOpportunityForm(filled, { now });
    expect(input!.deadline % HALF_HOUR).toBe(0);
    expect(input!.deadline).toBe(new Date(2026, 11, 2).getTime());
  });

  it("treats empty pay fields as zero and anyone-can-claim as ungated", () => {
    const { input } = parseOpportunityForm(
      { ...filled, fixedFee: "", cpmRate: "", paymentCap: "", isOpenToAll: true },
      { now },
    );
    expect(input).toMatchObject({
      fixedFeeCents: 0,
      cpmRateCents: 0,
      paymentCapCents: 0,
      isGated: false,
    });
  });

  it("turns criteria lines into ids the backend accepts", () => {
    const { input } = parseOpportunityForm(
      {
        ...filled,
        usesAiReview: true,
        deliverables: [
          { ...filled.deliverables[0], criteria: "Shows the app\n\n Tags @claudeai " },
        ],
      },
      { now },
    );
    expect(input!.deliverables![0].reviewCriteria).toEqual([
      { id: "criterion-1", description: "Shows the app" },
      { id: "criterion-2", description: "Tags @claudeai" },
    ]);
  });
});

describe("validateOpportunityStep", () => {
  it("names the details that are missing", () => {
    const errors = validateOpportunityStep(EMPTY_OPPORTUNITY_FORM, "details", { now });
    expect(Object.keys(errors).sort()).toEqual(["deadlineDate", "description", "title"]);
  });

  it("rejects a deadline that has passed", () => {
    const errors = validateOpportunityStep({ ...filled, deadlineDate: "2026-11-13" }, "details", {
      now,
    });
    expect(errors.deadlineDate).toBeDefined();
  });

  it("rejects a deadline after the campaign ends", () => {
    const errors = validateOpportunityStep(filled, "details", {
      now,
      campaignEndsAt: new Date(2026, 10, 30).getTime(),
    });
    expect(errors.deadlineDate).toMatch(/campaign ends/);
  });

  it("requires a deliverable with a title and description", () => {
    const errors = validateOpportunityStep(
      { ...filled, deliverables: [{ title: "", description: "", criteria: "" }] },
      "requirements",
      { now },
    );
    expect(errors["deliverables.0.title"]).toBeDefined();
    expect(errors["deliverables.0.description"]).toBeDefined();
  });

  it("rejects pay that isn't dollars and cents", () => {
    const errors = validateOpportunityStep(
      { ...filled, fixedFee: "abc", cpmRate: "1.234" },
      "compensation",
      { now },
    );
    expect(Object.keys(errors).sort()).toEqual(["cpmRate", "fixedFee"]);
  });

  it("rejects a product link that isn't a web address", () => {
    const errors = validateOpportunityStep(
      { ...filled, productAccessLink: "not a link" },
      "requirements",
      { now },
    );
    expect(errors.productAccessLink).toBeDefined();
  });

  it("asks for criteria on every deliverable before AI review is on", () => {
    const errors = validateOpportunityStep({ ...filled, usesAiReview: true }, "policy", { now });
    expect(errors.usesAiReview).toBeDefined();
  });
});

describe("opportunityFormValues", () => {
  it("round-trips a saved opportunity's brief", () => {
    const { input } = parseOpportunityForm(filled, { now });
    const values = opportunityFormValues({ ...input!, productAccessLink: undefined });
    expect(values).toMatchObject({
      title: "Opus 5.5 - Web Dev",
      deadlineDate: "2026-12-01",
      maxSlots: "10",
      fixedFee: "300.00",
      cpmRate: "3.50",
      isOpenToAll: false,
    });
  });
});

describe("parseOpportunityUpdate", () => {
  const saved = parseOpportunityForm(filled, { now }).input!;
  const original = opportunityFormValues({ ...saved, productAccessLink: "https://claude.ai" });

  it("sends only the fields that changed", () => {
    const result = parseOpportunityUpdate(
      { ...original, title: "Renamed", niches: ["technology", "education"] },
      original,
      { now },
    );
    expect(result.updates).toEqual({ title: "Renamed", niches: ["technology", "education"] });
  });

  it("clears an emptied link and follower minimum with null", () => {
    const result = parseOpportunityUpdate(
      { ...original, productAccessLink: "", minFollowerRange: "" },
      original,
      { now },
    );
    expect(result.updates).toEqual({ productAccessLink: null, minFollowerRange: null });
  });

  it("doesn't ask for deliverables, which change elsewhere", () => {
    const result = parseOpportunityUpdate({ ...original, maxSlots: "12" }, original, { now });
    expect(result.errors).toBeUndefined();
    expect(result.updates).toEqual({ maxSlots: 12 });
  });

  it("returns field errors instead of updates", () => {
    const result = parseOpportunityUpdate({ ...original, title: " " }, original, { now });
    expect(result.errors).toEqual({ title: expect.any(String) });
  });
});
