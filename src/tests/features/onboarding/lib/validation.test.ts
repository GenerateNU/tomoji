import { describe, expect, test } from "vitest";
import { additionalLinkErrors, duplicateLinkRow } from "@/features/onboarding/lib/validation";

describe("duplicateLinkRow", () => {
  test("finds the repeated row as typed, skipping invalid and blank rows", () => {
    expect(duplicateLinkRow(["a.example", "not a url", "", "https://A.example/"])).toBe(3);
    expect(duplicateLinkRow(["a.example", "b.example"])).toBeNull();
  });

  test("finds a row that repeats the GitHub field", () => {
    expect(duplicateLinkRow(["github.com/creator"], ["https://github.com/creator", ""])).toBe(0);
  });
});

describe("additionalLinkErrors", () => {
  test("treats a bare domain and its https form as the same link", () => {
    expect(additionalLinkErrors(["example.com", "https://Example.com/"])).toEqual({
      1: "You've already added this link.",
    });
  });

  test("reports an invalid row and skips blanks", () => {
    expect(additionalLinkErrors(["not a url", "", "https://a.example"])).toEqual({
      0: "Enter a valid URL",
    });
  });

  test("marks a link that repeats the GitHub or LinkedIn field", () => {
    expect(
      additionalLinkErrors(
        ["a.example", "linkedin.com/in/creator"],
        ["github.com/creator", "https://linkedin.com/in/creator"],
      ),
    ).toEqual({ 1: "You've already added this link." });
  });

  test("ignores blank or invalid GitHub and LinkedIn fields", () => {
    expect(additionalLinkErrors(["a.example"], ["", "not a url"])).toEqual({});
  });

  test("passes distinct links", () => {
    expect(additionalLinkErrors(["a.example", "b.example"])).toEqual({});
  });
});
