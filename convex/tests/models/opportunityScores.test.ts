import { describe, expect, test } from "vitest";
import { followerRangeFit } from "../../models/followerRanges";
import { scoreOpportunityMatch } from "../../models/opportunityScores";

describe("scoreOpportunityMatch", () => {
  test("scores the share of the opportunity's niches and skills the creator has", () => {
    // Niches 1/2 at weight 0.35, skills 0/1 at weight 0.25, normalized over 0.6.
    expect(
      scoreOpportunityMatch(
        { niches: ["ai-agents"], skills: [] },
        { niches: ["ai-agents", "llms"], skills: ["python"] },
      ),
    ).toBeCloseTo((0.35 * 0.5) / 0.6, 5);
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
