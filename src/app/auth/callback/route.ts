import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { finishGoogleSignIn, googleAttemptFor } from "@/features/auth/lib/google";

const authkitCallback = handleAuth();

// The one registered WorkOS redirect URI, shared by AuthKit and our Google button.
export async function GET(request: NextRequest): Promise<Response> {
  const attempt = googleAttemptFor(request);
  return attempt ? finishGoogleSignIn(request, attempt) : authkitCallback(request);
}
