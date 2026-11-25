import { describe, expect, test } from "vitest";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { notificationHref } from "@/features/notifications/lib/notification-display";

type Notification = Pick<Doc<"notifications">, "type" | "target">;

const applicationId = "application1" as Id<"applications">;
const opportunityId = "opportunity1" as Id<"opportunities">;
const applicationTarget = {
  kind: "application",
  applicationId,
  opportunityId,
} as const;

function href(type: Notification["type"], target: Notification["target"]) {
  return notificationHref({ type, target } as Notification);
}

describe("notificationHref", () => {
  test.each(["applicationOffered", "applicationOfferExpired"] as const)(
    "%s opens the offer",
    (type) => {
      expect(href(type, applicationTarget)).toBe("/applications?application=application1");
    },
  );

  test.each([
    "applicationRejected",
    "applicationOpportunityFull",
    "applicationOpportunityClosed",
  ] as const)("%s opens the opportunity the creator applied to", (type) => {
    expect(href(type, applicationTarget)).toBe("/opportunities?opportunity=opportunity1");
  });

  test.each(["applicationReceived", "applicationDeclined"] as const)(
    "%s, sent to a company member, opens their campaigns",
    (type) => {
      expect(href(type, applicationTarget)).toBe("/campaigns");
    },
  );

  test("an opportunity notification, sent to a company member, opens their campaigns", () => {
    expect(href("opportunityClosed", { kind: "opportunity", opportunityId })).toBe("/campaigns");
  });

  test("a campaign notification opens that campaign", () => {
    const campaignId = "campaign1" as Id<"campaigns">;
    expect(href("campaignClosed", { kind: "campaign", campaignId })).toBe("/campaigns/campaign1");
  });

  test("assignment and submission notifications open the assignment", () => {
    const assignmentId = "assignment1" as Id<"assignments">;
    expect(href("assignmentClaimed", { kind: "assignment", assignmentId })).toBe(
      "/assignments/assignment1",
    );
    expect(
      href("submissionApproved", {
        kind: "submission",
        submissionId: "submission1" as Id<"submissions">,
        assignmentId,
      }),
    ).toBe("/assignments/assignment1");
  });

  test("a dispute notification has no page yet", () => {
    expect(
      href("disputeOpened", {
        kind: "dispute",
        disputeId: "dispute1" as Id<"disputes">,
      }),
    ).toBeNull();
  });

  test("IDs are URL-encoded", () => {
    expect(
      href("applicationOffered", {
        ...applicationTarget,
        applicationId: "a&b" as Id<"applications">,
      }),
    ).toBe("/applications?application=a%26b");
  });
});
