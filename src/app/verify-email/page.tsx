import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { TextLink } from "@/features/auth/components/text-link";
import { VerifyEmailForm } from "@/features/auth/components/verify-email-form";
import { readPendingAuth } from "@/features/auth/lib/pending-auth";

export const metadata: Metadata = { title: "Verify your email · Tomoji" };

/** Reached when WorkOS asks for an emailed code before finishing sign-in. */
export default async function VerifyEmailPage() {
  const pending = await readPendingAuth();

  return (
    <AuthLayout title="Verify your email">
      {pending ? (
        <VerifyEmailForm email={pending.email} />
      ) : (
        <p className="text-sm text-muted-foreground">
          This sign-in has expired. <TextLink href="/login">Log in again</TextLink> to get a new
          code.
        </p>
      )}
    </AuthLayout>
  );
}
