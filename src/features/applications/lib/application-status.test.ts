import { describe, expect, test } from "vitest";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS,
  type ApplicationStatus,
} from "./application-status";

describe("application status labels", () => {
  test("calls a pending application 'In review', as in the design", () => {
    expect(APPLICATION_STATUS_LABELS.pending).toBe("In review");
  });

  test("offers every status exactly once as a filter option", () => {
    const statuses = Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[];
    expect([...APPLICATION_STATUS_OPTIONS].sort()).toEqual([...statuses].sort());
  });
});
