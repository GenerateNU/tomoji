import { describe, expect, it } from "vitest";
import {
  applicationStatusTag,
  assignmentStatusTag,
  countLabel,
} from "@/features/company-opportunities/modal/lib/status-labels";

describe("applicationStatusTag", () => {
  it("asks the company to review pending applications", () => {
    expect(applicationStatusTag("pending")).toEqual({ label: "Needs review", tone: "primary" });
  });

  it("names every other status plainly", () => {
    expect(applicationStatusTag("offered").label).toBe("Offer sent");
    expect(applicationStatusTag("offerExpired").label).toBe("Offer expired");
    expect(applicationStatusTag("opportunityFull").label).toBe("Opportunity full");
    expect(applicationStatusTag("rejected").tone).toBe("neutral");
  });
});

describe("assignmentStatusTag", () => {
  it("labels each assignment status", () => {
    expect(assignmentStatusTag("termsPending").label).toBe("Reviewing terms");
    expect(assignmentStatusTag("active")).toEqual({ label: "Active", tone: "primary" });
    expect(assignmentStatusTag("cancelled").tone).toBe("destructive");
  });
});

describe("countLabel", () => {
  it("is exact once every page has loaded", () => {
    expect(countLabel(6, "Exhausted")).toBe("6");
  });

  it("marks a partial count, and shows nothing while the first page loads", () => {
    expect(countLabel(25, "CanLoadMore")).toBe("25+");
    expect(countLabel(25, "LoadingMore")).toBe("25+");
    expect(countLabel(0, "LoadingFirstPage")).toBeUndefined();
  });
});
