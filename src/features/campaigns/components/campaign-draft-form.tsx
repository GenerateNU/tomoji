import { RequireAccount } from "@/features/users/components/require-account";
import { CreateCampaignFlow } from "./create-campaign-flow";

/** The admin-only campaign creation route's content. */
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
      <CreateCampaignFlow />
    </RequireAccount>
  );
}
