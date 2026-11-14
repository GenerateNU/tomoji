import { RequireAccount } from "@/features/users/components/require-account";
import { CompanyCampaigns } from "./company-campaigns";

/** Shows only the signed-in company's campaigns, with server-side status filtering. */
export function CampaignList() {
  return (
    <RequireAccount
      role="company"
      next="/campaigns"
      wrongRole="A company account is required to view campaigns."
      loading="Loading campaigns…"
      unsynced="We’re finishing setting up your account."
    >
      <CompanyCampaigns />
    </RequireAccount>
  );
}
