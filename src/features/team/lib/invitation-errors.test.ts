import { expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { invitationError } from "./invitation-errors";

test("explains a pending invitation conflict", () => {
  expect(
    invitationError(
      new ConvexError({ code: "conflict", reason: "invite_already_pending" }),
      "send",
    ),
  ).toBe("That email already has a pending invitation.");
});

test("does not describe an existing account as a pending invitation", () => {
  expect(
    invitationError(new ConvexError({ code: "conflict", reason: "already_registered" }), "send"),
  ).toBe("That email is already registered. Ask a workspace admin for help.");
});

test("asks the admin to check the list when a send result is uncertain", () => {
  expect(invitationError(new ConvexError({ code: "upstream_failure" }), "send")).toContain(
    "Check pending invitations before trying again",
  );
});

test("treats an unknown send failure as uncertain rather than safe to retry", () => {
  expect(invitationError(new Error("connection lost"), "send")).toContain(
    "Check pending invitations before trying again",
  );
});

test("explains that a missing cancellation target may have already changed", () => {
  expect(invitationError(new ConvexError({ code: "not_found" }), "cancel")).toBe(
    "This invitation is no longer available. Check the pending list.",
  );
});

test("preserves the standard permission error", () => {
  expect(invitationError(new ConvexError({ code: "forbidden" }), "send")).toBe(
    "You don't have permission to perform this action.",
  );
});

test("does not guess the meaning of an unrecognized conflict", () => {
  expect(
    invitationError(new ConvexError({ code: "conflict", reason: "other_conflict" }), "send"),
  ).toBe("This action conflicts with an existing record. Please check and try again.");
});

test("asks the admin to check the list after an uncertain cancellation", () => {
  expect(invitationError(new ConvexError({ code: "upstream_failure" }), "cancel")).toContain(
    "Check pending invitations before trying again",
  );
});
