import { ConvexError } from "convex/values";
import { errorCode, errorMessage } from "@/lib/errors";

/** Separates known invitation conflicts from results that may still sync later. */
export function invitationError(error: unknown, operation: "send" | "cancel"): string {
  const code = errorCode(error);
  if (operation === "send" && error instanceof ConvexError && code === "conflict") {
    const data: unknown = error.data;
    const reason = data && typeof data === "object" && "reason" in data ? data.reason : null;
    if (reason === "invite_already_pending") return "That email already has a pending invitation.";
    if (reason === "already_registered")
      return "That email is already registered. Ask a workspace admin for help.";
  }
  if (operation === "cancel" && code === "not_found")
    return "This invitation is no longer available. Check the pending list.";
  if (code === null || code === "upstream_failure")
    return "We couldn't confirm the result. Check pending invitations before trying again.";
  return errorMessage(error);
}
