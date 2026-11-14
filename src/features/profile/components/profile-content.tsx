import { RequireAccount } from "@/features/users/components/require-account";
import { CreatorProfile } from "./creator-profile";
import { ProfileSkeleton } from "./profile-skeleton";

export function ProfileContent() {
  return (
    <RequireAccount
      role="creator"
      next="/profile"
      wrongRole="Creator profiles are currently available for creator accounts."
      fallback={<ProfileSkeleton />}
      unsynced="We’re finishing setting up your account. Your profile will appear here shortly."
    >
      <CreatorProfile />
    </RequireAccount>
  );
}
