import { describe, expect, test } from "vitest";
import crons from "../crons";

describe("earnings creation cron", () => {
  test("discovers due earnings every minute through the internal sweep", () => {
    expect(crons.crons["create due earnings"]).toEqual({
      name: "earningsSchedules:sweep",
      args: [{}],
      schedule: { type: "interval", minutes: 1 },
    });
  });
});

describe("payout approval cron", () => {
  test("checks for due payouts every minute through the internal mutation", () => {
    expect(crons.crons["approve due payouts"]).toEqual({
      name: "payouts:autoApprove",
      args: [{}],
      schedule: { type: "interval", minutes: 1 },
    });
  });
});

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

describe("X metrics sync cron", () => {
  test("runs the internal analytics sync daily at 00:00 UTC", () => {
    expect(crons.crons["sync X post metrics"]).toEqual({
      name: "xMetrics:sync",
      args: [{}],
      schedule: { type: "cron", cron: "0 0 * * *" },
    });
  });
});
