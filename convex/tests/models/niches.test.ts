import { describe, expect, test } from "vitest";
import { MAX_NICHES, NICHES, requireNiche, requireNiches } from "../../models/niches";

describe("requireNiches", () => {
  test("accepts names from the list, dropping repeats but keeping order", () => {
    expect(requireNiches(["llms", "ai-agents", "llms"])).toEqual(["llms", "ai-agents"]);
  });

  test("accepts an empty list", () => {
    expect(requireNiches([])).toEqual([]);
  });

  test("ignores case and surrounding spaces, and drops repeats after normalizing", () => {
    expect(requireNiches(["LLMs", " llms ", "DevOps"])).toEqual(["llms", "devops"]);
  });

  test("treats spaces and underscores between words as hyphens", () => {
    expect(requireNiches(["AI Agents", "machine_learning", "Open  Source"])).toEqual([
      "ai-agents",
      "machine-learning",
      "open-source",
    ]);
  });

  test.each([["skincare"], ["crypto"], [""], ["   "], ["llm"]])("refuses %j", (name) => {
    expect(() => requireNiches([name])).toThrow(/"reason":"invalid_niche"/);
  });

  test(`refuses more than ${MAX_NICHES} niches`, () => {
    const tooMany = NICHES.slice(0, MAX_NICHES + 1).map((niche) => niche.name);
    expect(() => requireNiches(tooMany)).toThrow(/"reason":"too_many_niches"/);
  });

  test(`allows exactly ${MAX_NICHES} niches`, () => {
    const limit = NICHES.slice(0, MAX_NICHES).map((niche) => niche.name);
    expect(requireNiches(limit)).toEqual(limit);
  });
});

describe("requireNiche", () => {
  test("returns the stored name for a known niche and refuses others", () => {
    expect(requireNiche("Generative AI")).toBe("generative-ai");
    expect(() => requireNiche("crypto")).toThrow(/"reason":"invalid_niche"/);
  });
});

describe("NICHES", () => {
  test("names are unique, lowercase kebab-case, and labeled", () => {
    const names = NICHES.map((niche) => niche.name);
    expect(new Set(names).size).toBe(names.length);
    for (const niche of NICHES) {
      expect(niche.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(niche.label.trim()).not.toBe("");
    }
  });
});
