import { describe, expect, test } from "vitest";
import { listSkills, requireSkill, requireSkills, SKILLS } from "../../models/skills";
import { expectApiError } from "../helpers";

describe("listSkills", () => {
  test("searches display labels case-insensitively", () => {
    expect(listSkills("  TAILWIND CSS  ")).toEqual([
      { name: "tailwind-css", label: "Tailwind CSS" },
    ]);
  });

  test("searches stored names independently of display labels", () => {
    expect(listSkills("nextjs")).toEqual([{ name: "nextjs", label: "Next.js" }]);
  });

  test("preserves catalog order when multiple options match", () => {
    expect(listSkills("react")).toEqual([
      { name: "react", label: "React" },
      { name: "react-native", label: "React Native" },
    ]);
  });

  test("returns no options when nothing matches", () => {
    expect(listSkills("invented skill")).toEqual([]);
  });

  test("returns the full catalog for an omitted or blank search", () => {
    expect(listSkills()).toEqual(SKILLS);
    expect(listSkills("   ")).toEqual(SKILLS);
  });
});

describe("requireSkills", () => {
  test("normalizes names and labels, dropping repeats in selection order", () => {
    expect(requireSkills(["  NEXT.JS ", "react_native", "Next.js", "C#"])).toEqual([
      "nextjs",
      "react-native",
      "c-sharp",
    ]);
  });

  test("accepts an empty selection", () => {
    expect(requireSkills([])).toEqual([]);
  });

  test("rejects unknown skills with a structured error", async () => {
    await expectApiError(
      async () => requireSkills(["Python", "invented skill"]),
      "invalid_state",
      "invalid_skill",
    );
  });
});

describe("requireSkill", () => {
  test("distinguishes C, C++, and C#", () => {
    expect(requireSkill("C")).toBe("c");
    expect(requireSkill("C++")).toBe("c-plus-plus");
    expect(requireSkill("C#")).toBe("c-sharp");
  });

  test("rejects unsupported punctuation variants", async () => {
    await expectApiError(async () => requireSkill("C+"), "invalid_state", "invalid_skill");
  });

  test("rejects blank values", async () => {
    await expectApiError(async () => requireSkill("   "), "invalid_state", "invalid_skill");
  });

  test("rejects abbreviations absent from the engineering list", async () => {
    await expectApiError(async () => requireSkill("ML"), "invalid_state", "invalid_skill");
  });
});

describe("SKILLS", () => {
  test("has unique stable names and unambiguous display labels", () => {
    expect(new Set(SKILLS.map((option) => option.name)).size).toBe(SKILLS.length);
    for (const option of SKILLS) {
      expect(option.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(option.label.trim()).not.toBe("");
      expect(requireSkill(option.name)).toBe(option.name);
      expect(requireSkill(option.label)).toBe(option.name);
    }
  });
});
