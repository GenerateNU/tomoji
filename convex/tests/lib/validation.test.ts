import { expect, test } from "vitest";
import { HALF_HOUR_MS, isHalfHourTimestamp } from "../../lib/validation";

test("half-hour alignment checks do not impose a future-time policy", () => {
  expect(isHalfHourTimestamp(0)).toBe(true);
  expect(isHalfHourTimestamp(HALF_HOUR_MS)).toBe(true);
  expect(isHalfHourTimestamp(-HALF_HOUR_MS)).toBe(true);
});

test("half-hour timestamps reject offsets and non-safe integers", () => {
  expect(isHalfHourTimestamp(1)).toBe(false);
  expect(isHalfHourTimestamp(HALF_HOUR_MS + 1000)).toBe(false);
  expect(isHalfHourTimestamp(0.5)).toBe(false);
  expect(isHalfHourTimestamp(NaN)).toBe(false);
  expect(isHalfHourTimestamp(Infinity)).toBe(false);
  expect(isHalfHourTimestamp(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
});
