import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { TextLink } from "@/features/auth/components/text-link";

export const metadata: Metadata = { title: "Choose a new password · Tomoji" };

/** Opened from the WorkOS reset email, which appends `?token=…`. */
export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const { token } = await props.searchParams;

  return (
    <AuthLayout title="Choose a new password">
      {typeof token === "string" && token !== "" ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-muted-foreground">
          This link is missing its reset code.{" "}
          <TextLink href="/forgot-password">Request a new link</TextLink> and open it straight from
          the email.
        </p>
      )}
    </AuthLayout>
  );
}
