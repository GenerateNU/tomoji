import { NavAuth } from "@/components/nav-auth";
import { ProfileNavLink } from "@/features/profile/components/profile-nav-link";
import Link from "next/link";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[.08] px-4 py-3 sm:px-6 dark:border-white/[.145]">
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-6">
          <Link
            href="/"
            className="rounded font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Ohani
          </Link>
          <ProfileNavLink />
          <Link
            href="/settings"
            className="rounded py-2 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Settings
          </Link>
        </nav>
        <NavAuth />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
