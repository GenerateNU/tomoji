import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = { title: "Sign up · Tomoji" };

export default function SignUpPage() {
  return (
    <AuthLayout
      title="Welcome to Tomoji!"
      description="Create your account to start connecting with tech companies today."
    >
      <SignUpForm />
    </AuthLayout>
  );
}
