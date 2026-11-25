import { expect, test } from "vitest";
import { APPLICATION_TAB_STATUSES } from "@convex/models/applications";
import { applicationTab } from "@/features/applications/lib/application-status";

test("each status opens the tab the server lists it under", () => {
  for (const [tab, statuses] of Object.entries(APPLICATION_TAB_STATUSES)) {
    for (const status of statuses) expect(applicationTab(status)).toBe(tab);
  }
});
