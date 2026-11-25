import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { OwnCreatorProfile } from "../../models/creators";
import { measureProfileCompletion } from "../../models/profileCompletion";

describe("measureProfileCompletion", () => {
  const empty: OwnCreatorProfile = {
    creatorId: "creator" as Id<"creators">,
    joinedAt: 0,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    additionalLinks: [],
    niches: [],
    skills: [],
    languages: [],
  };
  const onboarded: OwnCreatorProfile = {
    ...empty,
    dateOfBirth: Date.UTC(1990, 0, 1),
    countryOfResidence: "US",
    languages: ["english"],
    niches: ["tech"],
    skills: ["typescript"],
  };
  const notConnected = { xConnected: false };

  test("weighs eight items equally and leaves name and email out", () => {
    const completion = measureProfileCompletion(empty, notConnected);

    expect(completion.percent).toBe(0);
    expect(completion.items.map((entry) => entry.item)).toEqual([
      "profilePicture",
      "xAccount",
      "portfolioLink",
      "dateOfBirth",
      "countryOfResidence",
      "languages",
      "niches",
      "skills",
    ]);
    expect(completion.items.every((entry) => !entry.isComplete)).toBe(true);
  });

  test("counts a creator fresh from onboarding as five of eight", () => {
    expect(measureProfileCompletion(onboarded, notConnected).percent).toBe(63);
  });

  test.each([
    { githubLink: "https://github.com/ada" },
    { linkedinLink: "https://www.linkedin.com/in/ada" },
    { additionalLinks: ["https://ada.example.com/"] },
  ])("fills the portfolio item with any one link %j", (link) => {
    const completion = measureProfileCompletion({ ...onboarded, ...link }, notConnected);

    expect(completion.items.find((entry) => entry.item === "portfolioLink")?.isComplete).toBe(true);
    expect(completion.percent).toBe(75);
  });

  test("an X account that needs reconnecting doesn't count", () => {
    const completion = measureProfileCompletion({ ...onboarded, xId: "123456789" }, notConnected);

    expect(completion.items.find((entry) => entry.item === "xAccount")?.isComplete).toBe(false);
  });

  test("reaches 100 with only what the profile editor can set", () => {
    const completion = measureProfileCompletion(
      {
        ...onboarded,
        profilePictureMediaId: "picture" as Id<"mediaUploads">,
        xId: "123456789",
        githubLink: "https://github.com/ada",
      },
      { xConnected: true },
    );

    expect(completion.percent).toBe(100);
    expect(completion.items.every((entry) => entry.isComplete)).toBe(true);
  });
});
