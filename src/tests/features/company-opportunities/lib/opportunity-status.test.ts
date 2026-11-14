import { describe, expect, it } from "vitest";
import { opportunityTiming } from "@/features/company-opportunities/lib/opportunity-status";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 14, 12);

describe("opportunityTiming", () => {
  it("says when a live opportunity began", () => {
    expect(
      opportunityTiming(
        { status: "open", _creationTime: now - 28 * DAY, deadline: now + 5 * DAY },
        now,
      ),
    ).toBe("Began 28 days ago");
  });

  it("says a paused opportunity is paused and when it began", () => {
    expect(
      opportunityTiming(
        { status: "paused", _creationTime: now - 3 * DAY, deadline: now + 5 * DAY },
        now,
      ),
    ).toBe("Paused · began 3 days ago");
  });

  it("dates a draft from when it was created", () => {
    expect(
      opportunityTiming({ status: "draft", _creationTime: now - DAY, deadline: now + DAY }, now),
    ).toBe("Draft · created 1 day ago");
  });

  it("dates an ended opportunity from its deadline once that has passed", () => {
    expect(
      opportunityTiming(
        { status: "closed", _creationTime: now - 9 * DAY, deadline: now - 2 * DAY },
        now,
      ),
    ).toBe("Ended 2 days ago");
  });

  it("doesn't claim a deadline for one ended before it", () => {
    expect(
      opportunityTiming(
        { status: "closed", _creationTime: now - 9 * DAY, deadline: now + 2 * DAY },
        now,
      ),
    ).toBe("Ended early");
  });
});
