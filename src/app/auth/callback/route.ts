import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { authKitFailure } from "@/features/auth/lib/callback-error";
import { finishGoogleSignIn, googleAttemptFor } from "@/features/auth/lib/google";
import { finishInviteAcceptance, inviteAttemptFor } from "@/features/auth/lib/invite";

const authkitCallback = handleAuth({ onError: authKitFailure });

// The one registered WorkOS redirect URI, shared by AuthKit, our Google button
// and accepted invitations. Each of ours is recognised by the `state` matching
// the cookie its starting route set; anything else is AuthKit's.
export async function GET(request: NextRequest): Promise<Response> {
  const google = googleAttemptFor(request);
  if (google) return finishGoogleSignIn(request, google);

  const invite = inviteAttemptFor(request);
  if (invite) return finishInviteAcceptance(request, invite);

  return authkitCallback(request);
}
