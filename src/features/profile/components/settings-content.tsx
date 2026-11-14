import { RequireAccount } from "@/features/users/components/require-account";
import { CreatorSettings } from "./creator-settings";
import { SettingsSkeleton } from "./settings-skeleton";

export function SettingsContent() {
  return (
    <RequireAccount
      role="creator"
      next="/settings"
      wrongRole="Profile settings are currently available for creator accounts."
      fallback={<SettingsSkeleton />}
      unsynced="We’re finishing setting up your account. Your settings will appear here shortly."
    >
      <CreatorSettings />
    </RequireAccount>
  );
}
