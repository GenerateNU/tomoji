import { describe, expect, test } from "vitest";
import crons from "../crons";

describe("opportunity deadline cron", () => {
  test("runs the internal deadline mutation at :00 and :30 UTC", () => {
    expect(crons.crons["close expired opportunities"]).toEqual({
      name: "opportunities:closeExpired",
      args: [{}],
      schedule: { type: "cron", cron: "0,30 * * * *" },
    });
  });
});
