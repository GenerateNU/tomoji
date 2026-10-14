import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { LogInForm } from "@/features/auth/components/log-in-form";

export const metadata: Metadata = { title: "Log in · Tomoji" };

export default async function LogInPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  // Set by /auth/callback when a Google sign-in fails; the reason itself is never put in the URL.
  const notice = error === "google" ? "Google sign-in didn't finish. Try again." : null;

  return (
    <AuthLayout title="Welcome back">
      <LogInForm notice={notice} />
    </AuthLayout>
  );
}
