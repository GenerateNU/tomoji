import { describe, expect, test } from "vitest";
import crons from "../crons";

describe("campaign deadline cron", () => {
  test("runs the internal campaign deadline mutation every minute", () => {
    expect(crons.crons["close expired campaigns"]).toEqual({
      name: "campaigns:closeExpired",
      args: [{}],
      schedule: { type: "interval", minutes: 1 },
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
