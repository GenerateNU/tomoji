import { startGoogleSignIn } from "@/features/auth/lib/google";

/** Starts Google sign-in, going straight to Google instead of the WorkOS-hosted page. */
export const GET = startGoogleSignIn;
