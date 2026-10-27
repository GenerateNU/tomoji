import { describe, expect, test } from "vitest";
import { listNiches, MAX_NICHES, NICHES, requireNiche, requireNiches } from "../../models/niches";
import { expectApiError } from "../helpers";

describe("listNiches", () => {
  test("searches stored names independently of display labels", () => {
    expect(listNiches("databases")).toEqual([{ name: "databases", label: "Database Management" }]);
  });

  test("searches display labels case-insensitively", () => {
    expect(listNiches("DATABASE MANAGEMENT")).toEqual([
      { name: "databases", label: "Database Management" },
    ]);
  });

  test("returns all options for an omitted or blank search", () => {
    expect(listNiches()).toEqual(NICHES);
    expect(listNiches("   ")).toEqual(NICHES);
  });

  test("returns no options for an unknown search", () => {
    expect(listNiches("invented niche")).toEqual([]);
  });
});

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

  test("rejects unknown niches", async () => {
    await expectApiError(async () => requireNiches(["crypto"]), "invalid_state", "invalid_niche");
  });

  test("rejects an empty niche name", async () => {
    await expectApiError(async () => requireNiches([""]), "invalid_state", "invalid_niche");
  });

  test("rejects a whitespace-only niche name", async () => {
    await expectApiError(async () => requireNiches(["   "]), "invalid_state", "invalid_niche");
  });

  test("rejects an unrecognized abbreviation", async () => {
    await expectApiError(async () => requireNiches(["llm"]), "invalid_state", "invalid_niche");
  });

  test(`refuses more than ${MAX_NICHES} niches`, async () => {
    const tooMany = NICHES.slice(0, MAX_NICHES + 1).map((niche) => niche.name);
    await expectApiError(async () => requireNiches(tooMany), "invalid_state", "too_many_niches");
  });

  test(`allows exactly ${MAX_NICHES} niches`, () => {
    const limit = NICHES.slice(0, MAX_NICHES).map((niche) => niche.name);
    expect(requireNiches(limit)).toEqual(limit);
  });
});

describe("requireNiche", () => {
  test("returns the stored name for a known niche", () => {
    expect(requireNiche("Generative AI")).toBe("generative-ai");
  });

  test("resolves design labels to existing stored identifiers", () => {
    expect(requireNiche("Database Management")).toBe("databases");
    expect(requireNiche("Mobile App Development")).toBe("mobile-development");
    expect(requireNiches(["databases", "Database Management"])).toEqual(["databases"]);
  });

  test("rejects picker examples absent from the engineering list", async () => {
    await expectApiError(
      async () => requireNiche("Backend technologies"),
      "invalid_state",
      "invalid_niche",
    );
  });

  test("rejects placeholder options", async () => {
    await expectApiError(
      async () => requireNiche("Other options"),
      "invalid_state",
      "invalid_niche",
    );
  });

  test("continues accepting every legacy niche identifier", () => {
    const legacyNames = [
      "llms",
      "ai-agents",
      "machine-learning",
      "generative-ai",
      "developer-tools",
      "web-development",
      "mobile-development",
      "devops",
      "databases",
      "data-science",
      "cybersecurity",
      "open-source",
      "programming",
      "startups",
      "productivity",
      "no-code",
      "hardware",
      "game-dev",
      "web3",
      "design",
      "tech-careers",
    ];
    expect(legacyNames.map(requireNiche)).toEqual(legacyNames);
  });
});

describe("NICHES", () => {
  test("uses the engineering-note order, with legacy-only options at the end", () => {
    expect(NICHES.slice(0, 3)).toEqual([
      { name: "frontend-development", label: "Frontend Development" },
      { name: "backend-development", label: "Backend Development" },
      { name: "full-stack-development", label: "Full-Stack Development" },
    ]);
    expect(NICHES.slice(-3)).toEqual([
      { name: "llms", label: "LLMs" },
      { name: "ai-agents", label: "AI Agents" },
      { name: "productivity", label: "Productivity Tools" },
    ]);
  });

  test("names are unique, lowercase kebab-case, and labeled", () => {
    const names = NICHES.map((niche) => niche.name);
    expect(new Set(names).size).toBe(names.length);
    for (const niche of NICHES) {
      expect(niche.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(niche.label.trim()).not.toBe("");
      expect(requireNiche(niche.label)).toBe(niche.name);
    }
  });
});
