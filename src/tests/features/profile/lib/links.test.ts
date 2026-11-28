import { describe, expect, test } from "vitest";
import { duplicateLinkRow, parseAdditionalLinks } from "@/features/profile/lib/links";

describe("duplicateLinkRow", () => {
  test("finds the repeated row as typed, skipping rows that aren't valid yet", () => {
    expect(duplicateLinkRow(["https://a.example", "https://b", "", "https://A.example/"])).toBe(3);
    expect(duplicateLinkRow(["https://a.example", "a.example"])).toBeNull();
  });

  test("finds a row that repeats the LinkedIn field", () => {
    expect(
      duplicateLinkRow(
        ["https://www.linkedin.com/in/creator"],
        [null, "https://www.linkedin.com/in/creator"],
      ),
    ).toBe(0);
  });
});

describe("parseAdditionalLinks", () => {
  test("marks the second of two matching links", () => {
    expect(
      parseAdditionalLinks(["https://a.example", "https://b.example", "https://A.example/"]),
    ).toEqual({ ok: false, error: "You've already added this link.", index: 2 });
  });

  test("points at the typed row even with a blank row between", () => {
    expect(parseAdditionalLinks(["https://a.example/x", "", "https://a.example/x/"])).toMatchObject(
      { ok: false, index: 2 },
    );
  });

  test("marks a link that repeats the GitHub or LinkedIn field", () => {
    expect(
      parseAdditionalLinks(
        ["https://a.example", "https://www.linkedin.com/in/creator/"],
        ["https://github.com/creator", "https://www.linkedin.com/in/creator"],
      ),
    ).toEqual({ ok: false, error: "You've already added this link.", index: 1 });
  });

  test("ignores empty GitHub and LinkedIn fields", () => {
    expect(parseAdditionalLinks(["https://a.example"], [null, null])).toMatchObject({ ok: true });
  });

  test("accepts distinct links", () => {
    expect(parseAdditionalLinks(["https://a.example", "https://b.example"])).toEqual({
      ok: true,
      value: ["https://a.example/", "https://b.example/"],
    });
  });
});
