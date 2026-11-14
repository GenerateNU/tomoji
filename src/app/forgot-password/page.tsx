import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password · Tomoji" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout title="Reset your password">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
