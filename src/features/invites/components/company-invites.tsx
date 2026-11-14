import { RequireAccount } from "@/features/users/components/require-account";
import { TeammateInvites } from "./teammate-invites";

/** Sending and cancelling teammate invitations for the caller's company. */
export function CompanyInvites() {
  return (
    <RequireAccount
      role="company"
      companyRole="admin"
      next="/team"
      wrongRole="Only company admins can manage teammate invitations."
      loading="Loading invitations…"
      unsynced="We’re finishing setting up your account."
    >
      <TeammateInvites />
    </RequireAccount>
  );
}
