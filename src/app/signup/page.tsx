import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { safeNext } from "@/features/auth/lib/access";

export const metadata: Metadata = { title: "Sign up · Tomoji" };

export default async function SignUpPage(props: PageProps<"/signup">) {
  const { next } = await props.searchParams;
  return (
    <AuthLayout
      title="Welcome to Tomoji!"
      description="Create your account to start connecting with tech companies today."
    >
      <SignUpForm next={safeNext(next)} />
    </AuthLayout>
  );
}
