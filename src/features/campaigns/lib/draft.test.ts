import { describe, expect, test } from "vitest";
import { parseCampaignDraft } from "./draft";

/** Browser form input, not a second definition of the backend campaign schema. */
function form() {
  const data = new FormData();
  for (const name of ["title", "objective", "product", "audience", "description"])
    data.set(name, ` ${name} `);
  data.set("budget", "1250.05");
  data.set("startsAt", "2026-10-15T12:00");
  return data;
}

describe("parseCampaignDraft", () => {
  test("trims the brief, converts cents exactly, and saves only as draft", () => {
    expect(parseCampaignDraft(form())).toEqual({
      title: "title",
      objective: "objective",
      product: "product",
      audience: "audience",
      description: "description",
      budgetCents: 125005,
      startsAt: Date.parse("2026-10-15T12:00Z"),
      status: "draft",
    });
  });
  test("accepts zero budget and an end on the UTC half-hour grid", () => {
    const data = form();
    data.set("budget", "0");
    data.set("endsAt", "2026-10-15T12:30");
    expect(parseCampaignDraft(data).budgetCents).toBe(0);
    expect(parseCampaignDraft(data).endsAt).toBe(Date.parse("2026-10-15T12:30Z"));
  });
  test("rejects fractional cents instead of silently rounding", () => {
    const data = form();
    data.set("budget", "1.005");
    expect(() => parseCampaignDraft(data)).toThrow("two decimal places");
  });
  test("rejects unsafe budgets and negative amounts", () => {
    const data = form();
    data.set("budget", "9007199254740992");
    expect(() => parseCampaignDraft(data)).toThrow("too large");
    data.set("budget", "-1");
    expect(() => parseCampaignDraft(data)).toThrow("nonnegative");
  });
  test("rejects blank brief fields and invalid dates", () => {
    const data = form();
    data.set("objective", " ");
    expect(() => parseCampaignDraft(data)).toThrow("Objective");
    data.set("objective", "Introduce the product");
    data.set("startsAt", "2026-02-31T12:00");
    expect(() => parseCampaignDraft(data)).toThrow("valid UTC");
  });
  test("rejects an end before the start or off the half-hour grid", () => {
    const data = form();
    data.set("endsAt", "2026-10-15T11:30");
    expect(() => parseCampaignDraft(data)).toThrow("after the start");
    data.set("endsAt", "2026-10-15T12:15");
    expect(() => parseCampaignDraft(data)).toThrow(":00 or :30 UTC");
  });
});
