import { describe, expect, test } from "vitest";
import {
  formatDeadline,
  formatPostedAgo,
  formatSpotsLeft,
} from "@/features/opportunities/lib/format";

describe("formatDeadline", () => {
  const deadline = Date.UTC(2026, 9, 15, 17, 30);

  test("shows month and day by default", () => {
    expect(formatDeadline(deadline, { timeZone: "UTC" })).toBe("October 15");
  });

  test("can include the year", () => {
    expect(formatDeadline(deadline, { timeZone: "UTC", withYear: true })).toBe("October 15, 2026");
  });

  // A deadline late in the UTC day is already tomorrow further east, so this
  // proves the time zone is applied rather than just passed through.
  test("reads the date in the given time zone", () => {
    expect(formatDeadline(deadline, { timeZone: "Asia/Tokyo" })).toBe("October 16");
  });
});

describe("formatSpotsLeft", () => {
  test("counts open spots out of the total", () => {
    expect(formatSpotsLeft({ maxSlots: 20, numFilledSlots: 17 })).toBe("3/20 spots left");
  });

  test("never goes below zero", () => {
    expect(formatSpotsLeft({ maxSlots: 5, numFilledSlots: 6 })).toBe("0/5 spots left");
  });
});

describe("formatPostedAgo", () => {
  const now = Date.UTC(2026, 9, 14, 12);
  const day = 86_400_000;

  test.each([
    [now - 1000, "Today"],
    [now - day, "1 day ago"],
    [now - 10 * day - 1000, "10 days ago"],
  ])("%i is %s", (createdAt, expected) => {
    expect(formatPostedAgo(createdAt, now)).toBe(expected);
  });
});
