import { startInviteAcceptance } from "@/features/auth/lib/invite";

/** Where a WorkOS invitation email lands, so the invitee can accept and set a password. */
export const GET = startInviteAcceptance;
