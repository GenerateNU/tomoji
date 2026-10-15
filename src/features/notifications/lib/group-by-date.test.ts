import { describe, expect, test } from "vitest";
import type { Doc } from "@convex/_generated/dataModel";
import { groupByDate } from "./group-by-date";

const notification = (date: Date) => ({ _creationTime: date.getTime() }) as Doc<"notifications">;

describe("groupByDate", () => {
  test("combines notifications from the same day without changing their order", () => {
    const today = notification(new Date(2026, 9, 15, 12));
    const earlier = notification(new Date(2026, 9, 15, 9));
    const yesterday = notification(new Date(2026, 9, 14, 23));
    expect(groupByDate([today, earlier, yesterday], new Date(2026, 9, 15, 13))).toEqual([
      { label: "Today", notifications: [today, earlier] },
      { label: "Yesterday", notifications: [yesterday] },
    ]);
  });

  test("uses calendar days across daylight saving and year boundaries", () => {
    const previousYear = notification(new Date(2025, 11, 31, 23));
    expect(groupByDate([previousYear], new Date(2026, 0, 1, 1))[0].label).toBe("Yesterday");
    const beforeClockChange = notification(new Date(2026, 2, 7, 23));
    expect(groupByDate([beforeClockChange], new Date(2026, 2, 8, 23))[0].label).toBe("Yesterday");
  });

  test("labels older days with a full date and handles an empty inbox", () => {
    const older = notification(new Date(2026, 9, 9, 12));
    expect(groupByDate([older], new Date(2026, 9, 15))[0].label).toBe("October 9, 2026");
    expect(groupByDate([], new Date())).toEqual([]);
  });
});
