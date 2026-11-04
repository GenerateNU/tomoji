/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { requireAdultBirthdate } from "../../lib/birthdate";
import { expectApiError } from "../helpers";

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const NOW = utc(2026, 10, 27);

describe("requireAdultBirthdate", () => {
  test("accepts someone well over eighteen", () => {
    expect(requireAdultBirthdate(utc(1990, 5, 15), NOW)).toBe(utc(1990, 5, 15));
  });

  test("accepts someone on the morning of their eighteenth birthday", () => {
    expect(requireAdultBirthdate(utc(2008, 10, 27), NOW)).toBe(utc(2008, 10, 27));
  });

  test("refuses someone one day short", async () => {
    await expectApiError(
      async () => requireAdultBirthdate(utc(2008, 10, 28), NOW),
      "invalid_state",
      "under_minimum_age",
    );
  });

  // 29 February has no anniversary in 2027, so eligibility rolls to 1 March.
  test("rolls a leap-day birthday to the first of March", async () => {
    await expectApiError(
      async () => requireAdultBirthdate(utc(2008, 2, 29), utc(2026, 2, 28)),
      "invalid_state",
      "under_minimum_age",
    );
    expect(requireAdultBirthdate(utc(2008, 2, 29), utc(2026, 3, 1))).toBe(utc(2008, 2, 29));
  });

  test("refuses a future date", async () => {
    await expectApiError(
      async () => requireAdultBirthdate(utc(2030, 1, 1), NOW),
      "invalid_state",
      "invalid_date_of_birth",
    );
  });

  // Past Date's +/-8.64e15 range every comparison against it is false, so the
  // age check below would not fire rather than failing.
  test.each([
    ["one day past the earliest Date", -8_640_086_400_000_000],
    ["one day past the latest Date", 8_640_086_400_000_000],
  ])("refuses a timestamp outside the Date range: %s", async (_label, dateOfBirth) => {
    await expectApiError(
      async () => requireAdultBirthdate(dateOfBirth, NOW),
      "invalid_state",
      "invalid_date_of_birth",
    );
  });

  test("accepts the earliest timestamp Date can represent", () => {
    expect(requireAdultBirthdate(-8_640_000_000_000_000, NOW)).toBe(-8_640_000_000_000_000);
  });

  // A local-midnight timestamp is the previous day in UTC for anyone west of
  // it, which would shift the age at the boundary.
  test("refuses a timestamp that is not UTC midnight", async () => {
    await expectApiError(
      async () => requireAdultBirthdate(utc(1990, 5, 15) + 60_000, NOW),
      "invalid_state",
      "invalid_date_of_birth",
    );
  });
});
