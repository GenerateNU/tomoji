import { describe, expect, test } from "vitest";
import crons from "../crons";

describe("campaign deadline cron", () => {
  test("runs the internal campaign deadline mutation at :00 and :30 UTC", () => {
    expect(crons.crons["close expired campaigns"]).toEqual({
      name: "campaigns:closeExpired",
      args: [{}],
      schedule: { type: "cron", cron: "0,30 * * * *" },
    });
  });
});

describe("opportunity deadline cron", () => {
  test("runs the internal deadline mutation at :00 and :30 UTC", () => {
    expect(crons.crons["close expired opportunities"]).toEqual({
      name: "opportunities:closeExpired",
      args: [{}],
      schedule: { type: "cron", cron: "0,30 * * * *" },
    });
  });
});

describe("application offer expiry cron", () => {
  test("runs the internal expiry mutation at :00 and :30 UTC", () => {
    expect(crons.crons["expire application offers"]).toEqual({
      name: "applications:expireOffers",
      args: [{}],
      schedule: { type: "cron", cron: "0,30 * * * *" },
    });
  });
});
