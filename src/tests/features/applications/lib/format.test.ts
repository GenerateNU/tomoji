import { describe, expect, test } from "vitest";
import { applicationExpiresAt, formatRelativeTime } from "@/features/applications/lib/format";

const NOW = Date.UTC(2026, 9, 15, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("formatRelativeTime", () => {
  test("says how long ago a past time was", () => {
    expect(formatRelativeTime(NOW - 10 * DAY, NOW)).toBe("10 days ago");
  });

  test("says how far away a future time is", () => {
    expect(formatRelativeTime(NOW + 5 * DAY, NOW)).toBe("in 5 days");
  });

  test("uses hours and minutes for times within a day", () => {
    expect(formatRelativeTime(NOW - 3 * 60 * 60 * 1000, NOW)).toBe("3 hours ago");
    expect(formatRelativeTime(NOW + 20 * 60 * 1000, NOW)).toBe("in 20 minutes");
  });

  test("says 'just now' for the last minute", () => {
    expect(formatRelativeTime(NOW - 30 * 1000, NOW)).toBe("just now");
  });

  test("switches to months past a month", () => {
    expect(formatRelativeTime(NOW - 65 * DAY, NOW)).toBe("2 months ago");
  });
});

describe("applicationExpiresAt", () => {
  const deadline = NOW + 20 * DAY;
  const offerExpiresAt = NOW + 2 * DAY;

  test("uses the offer expiry for an offered application", () => {
    expect(applicationExpiresAt({ status: "offered", offerExpiresAt }, deadline)).toBe(
      offerExpiresAt,
    );
  });

  test("uses the opportunity deadline for a pending application", () => {
    expect(applicationExpiresAt({ status: "pending" }, deadline)).toBe(deadline);
  });

  test("has nothing for a pending application whose opportunity isn't visible", () => {
    expect(applicationExpiresAt({ status: "pending" }, undefined)).toBeNull();
  });

  test.each(["accepted", "declined", "rejected", "offerExpired", "opportunityFull"] as const)(
    "has nothing once the application is %s",
    (status) => {
      expect(applicationExpiresAt({ status, offerExpiresAt }, deadline)).toBeNull();
    },
  );
});
