import { describe, expect, test } from "vitest";
import { additionalLinkErrors } from "@/features/onboarding/lib/validation";

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

  test("passes distinct links", () => {
    expect(additionalLinkErrors(["a.example", "b.example"])).toEqual({});
  });
});
