import { describe, expect, test } from "vitest";
import { parseAdditionalLinks } from "@/features/profile/lib/links";

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

  test("accepts distinct links", () => {
    expect(parseAdditionalLinks(["https://a.example", "https://b.example"])).toEqual({
      ok: true,
      value: ["https://a.example/", "https://b.example/"],
    });
  });
});
