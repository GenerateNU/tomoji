import Image from "next/image";
import type { ReactNode } from "react";

/** The shared frame for every sign-in page: form on the left, artwork on the right. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <main className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="grid w-full max-w-sm gap-6">
          <header className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </header>
          {children}
        </div>
      </main>
      {/* The same artwork the onboarding flow opens with, so signing in and
          setting up a profile read as one journey. */}
      <div aria-hidden className="relative hidden bg-blue-primary lg:block">
        <Image
          src="/onboarding/onboarding.png"
          alt=""
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
      </div>
    </div>
  );
}
