import { describe, expect, test } from "vitest";
import { followerRangeFit } from "../../models/followerRanges";
import { describeMatch, scoreOpportunityMatch } from "../../models/opportunityMatch";

describe("scoreOpportunityMatch", () => {
  test("scores the share of the opportunity's niches and skills the creator has", () => {
    // Niches 1/2 at weight 0.2, skills 0/1 at weight 0.35, normalized over 0.55.
    expect(
      scoreOpportunityMatch(
        { niches: ["ai-agents"], skills: [] },
        { niches: ["ai-agents", "llms"], skills: ["python"] },
      ),
    ).toBeCloseTo((0.2 * 0.5) / 0.55, 5);
  });

  test("ignores signals the opportunity doesn't ask for", () => {
    expect(
      scoreOpportunityMatch(
        { niches: ["ai-agents"], skills: [] },
        { niches: ["ai-agents"], skills: [] },
      ),
    ).toBe(1);
    expect(
      scoreOpportunityMatch({ niches: ["ai-agents"], skills: [] }, { niches: [], skills: [] }),
    ).toBe(0);
  });
});

describe("followerRangeFit", () => {
  test("scores 1 at the minimum and drops by 1 for every 10x short", () => {
    expect(followerRangeFit("500k-plus", "10k-50k")).toBe(1);
    // ~2.2k typical vs a 5k minimum: about 2.3x short.
    expect(followerRangeFit("1k-5k", "5k-10k")).toBeCloseTo(0.64, 2);
    expect(followerRangeFit(undefined, "10k-50k")).toBe(0);
  });
});

describe("describeMatch", () => {
  test("lists what matches and what's missing, and stays eligible without the minimum's gaps", () => {
    expect(
      describeMatch(
        { niches: ["llms"], skills: ["python"], followerRange: "10k-50k" },
        { niches: ["llms", "databases"], skills: ["python", "go"], minFollowerRange: "5k-10k" },
      ),
    ).toEqual({
      isGreatMatch: false,
      matchedSkills: ["python"],
      missingSkills: ["go"],
      matchedNiches: ["llms"],
      meetsFollowerMinimum: true,
      isEligible: false,
    });
  });

  test("is a great, eligible match when the creator has everything", () => {
    const match = describeMatch(
      { niches: ["llms"], skills: ["python"], followerRange: "50k-100k" },
      { niches: ["llms"], skills: ["python"], minFollowerRange: "50k-100k" },
    );
    expect(match).toMatchObject({
      isGreatMatch: true,
      isEligible: true,
      meetsFollowerMinimum: true,
    });
  });

  test("is never great when the brief asks for nothing", () => {
    expect(describeMatch({ niches: [], skills: [] }, { niches: [], skills: [] })).toMatchObject({
      isGreatMatch: false,
      meetsFollowerMinimum: null,
      isEligible: true,
    });
  });

  test("isn't great below 90%, even when eligible", () => {
    // Every skill and the minimum, but only one of two niches: (0.45 + 0.35 + 0.1) / 1 = 0.9.
    const almost = describeMatch(
      { niches: ["llms"], skills: ["python"], followerRange: "50k-100k" },
      { niches: ["llms", "databases"], skills: ["python"], minFollowerRange: "50k-100k" },
    );
    expect(almost.isGreatMatch).toBe(true);
    const short = describeMatch(
      { niches: [], skills: ["python"], followerRange: "50k-100k" },
      { niches: ["llms", "databases"], skills: ["python"], minFollowerRange: "50k-100k" },
    );
    expect(short).toMatchObject({ isGreatMatch: false, isEligible: true });
  });
});
