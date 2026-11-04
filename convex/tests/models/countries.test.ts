/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { COUNTRIES, requireCountry } from "../../models/countries";
import { expectApiError } from "../helpers";

describe("requireCountry", () => {
  test("accepts an alpha-2 code in any case, trimmed", () => {
    expect(requireCountry("us")).toBe("US");
    expect(requireCountry("  Id  ")).toBe("ID");
  });

  test("returns a code the picker actually offers", () => {
    const codes = new Set(COUNTRIES.map((entry) => entry.code));
    expect(codes.has(requireCountry("gb"))).toBe(true);
  });

  // isValid also accepts these, but storing one leaves a value no picker
  // option matches, so the form shows a blank country and saves over it.
  test.each([
    ["an alpha-3 code", "USA"],
    ["a lowercase alpha-3 code", "gbr"],
    ["a numeric code", "840"],
  ])("refuses %s", async (_label, input) => {
    await expectApiError(async () => requireCountry(input), "invalid_state", "invalid_country");
  });

  test.each([
    ["an unassigned code", "ZZ"],
    ["an empty string", "   "],
  ])("refuses %s", async (_label, input) => {
    await expectApiError(async () => requireCountry(input), "invalid_state", "invalid_country");
  });
});
