import { RequireAccount } from "@/features/users/components/require-account";
import { DraftForm } from "./draft-form";

/** Creating a campaign draft. Publishing is a separate step. */
export function CampaignDraftForm() {
  return (
    <RequireAccount
      role="company"
      companyRole="admin"
      next="/campaigns/new"
      wrongRole="Only company admins can create campaigns."
      loading="Loading campaign form…"
      unsynced="We’re finishing setting up your account."
    >
      <DraftForm />
    </RequireAccount>
  );
}
