"use client";

import { startTransition, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiCloseLine,
  RiGroupLine,
  RiLogoutBoxRLine,
  RiMenuLine,
  RiNotification3Line,
  RiSettings3Line,
  RiUser3Line,
} from "@remixicon/react";
import { signOutAction } from "@/app/auth/actions";
import {
  AppSidebar,
  companyNavItems,
  creatorNavItems,
  operatorNavItems,
  type AccountMenuEntry,
  type NavEntry,
} from "@/components/app-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { Logo } from "@/components/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { SidebarPage } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfilePicture } from "@/features/profile/hooks/use-profile-picture";
import { useMe, type Me } from "@/features/users/hooks/use-me";
import { useMediaQuery } from "@/hooks/use-media-query";
import { iconProps } from "@/lib/icons";
import { isActivePath } from "@/lib/nav";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "../hooks/use-sidebar-collapsed";

type SyncedMe = Extract<Me, { synced: true }>;

function navItemsFor(role: SyncedMe["role"]): readonly NavEntry<string>[] {
  if (role === "creator") return creatorNavItems;
  if (role === "company") return companyNavItems;
  return operatorNavItems;
}

/** "Linda A." from the account's names. */
function accountName({ firstName, lastName }: Pick<SyncedMe, "firstName" | "lastName">): string {
  const initial = lastName.trim().charAt(0);
  return initial ? `${firstName} ${initial.toUpperCase()}.` : firstName;
}

function accountItems(me: SyncedMe): AccountMenuEntry[] {
  return [
    ...(me.role === "creator"
      ? [
          {
            kind: "link",
            id: "profile",
            label: "View profile",
            icon: RiUser3Line,
            href: "/profile",
          },
        ]
      : []),
    {
      kind: "link",
      id: "notifications",
      label: "Notifications",
      icon: RiNotification3Line,
      href: "/notifications",
    },
    ...(me.role === "company"
      ? [
          {
            kind: "link",
            id: "team",
            label: "Workspace members",
            icon: RiGroupLine,
            href: "/team",
          },
        ]
      : []),
    { kind: "link", id: "settings", label: "Settings", icon: RiSettings3Line, href: "/settings" },
    { kind: "separator", id: "separator" },
    {
      kind: "action",
      id: "sign-out",
      label: "Sign out",
      icon: RiLogoutBoxRLine,
      onSelect: () => startTransition(() => signOutAction()),
    },
  ] as AccountMenuEntry[];
}

/**
 * The logo with one thing to do beside it, used wherever the full sidebar
 * can't be: while the account loads, when signed out, and if the shell errors.
 * A top bar on narrow screens and a slim column from md up.
 */
function PlainChrome({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-gray-10 px-4 md:h-auto md:min-h-svh md:w-50 md:flex-col md:items-stretch md:justify-start md:gap-6 md:border-r md:border-b-0 md:px-5 md:py-6">
      <Link href="/" aria-label="ohani home" className={cn("w-fit rounded-xs", focusRing)}>
        <Logo size={16} />
      </Link>
      {children}
    </header>
  );
}

function SignOutButton() {
  return (
    <Button
      type="button"
      variant="secondary-subtle"
      size="sm"
      onClick={() => startTransition(() => signOutAction())}
    >
      Sign out
    </Button>
  );
}

function SyncedChrome({ me }: { me: SyncedMe }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // The drawer remembers the page it was opened on, so navigating closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname && !isDesktop;
  const picture = useProfilePicture(me.profilePictureMediaId ?? undefined);

  const items = navItemsFor(me.role);
  const activeId = items.find((item) => item.href && isActivePath(pathname, item.href))?.id;
  const account = {
    name: accountName(me),
    avatarSrc: picture.url,
    email: me.email,
    items: accountItems(me),
  };

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-gray-10 px-4 md:hidden">
        <Link href="/" aria-label="ohani home" className={cn("rounded-xs", focusRing)}>
          <Logo size={16} />
        </Link>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerPath(pathname)}
          className={cn(
            "-mr-2 flex size-11 cursor-pointer items-center justify-center rounded text-gray-950 transition-colors hover:bg-gray-50",
            focusRing,
          )}
        >
          <RiMenuLine {...iconProps} size={20} />
        </button>
      </div>

      <div className="sticky top-0 hidden h-svh shrink-0 md:block">
        <AppSidebar
          items={items}
          activeId={activeId}
          account={account}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          logoHref="/"
        />
      </div>

      <DialogPrimitive.Root
        open={drawerOpen}
        onOpenChange={(open) => setDrawerPath(open ? pathname : null)}
      >
        <DialogPortal>
          <DialogOverlay className="transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <DialogPrimitive.Popup
            data-slot="navigation-drawer"
            className="fixed inset-y-0 left-0 z-50 w-[min(85vw,280px)] bg-gray-10 text-gray-950 shadow-overlay outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full motion-reduce:transition-none"
          >
            <DialogTitle className="sr-only">Navigation</DialogTitle>
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className={cn(
                "absolute top-2 right-2 z-10 flex size-11 cursor-pointer items-center justify-center rounded text-gray-500 transition-colors hover:text-gray-950",
                focusRing,
              )}
            >
              <RiCloseLine {...iconProps} size={20} />
            </DialogPrimitive.Close>
            <AppSidebar
              items={items}
              activeId={activeId}
              account={account}
              collapsed={false}
              showToggle={false}
              logoHref="/"
              onNavigate={() => setDrawerPath(null)}
              className="w-full"
            />
          </DialogPrimitive.Popup>
        </DialogPortal>
      </DialogPrimitive.Root>
    </>
  );
}

function ShellChrome() {
  const me = useMe();

  if (me === undefined) {
    return (
      <PlainChrome>
        <div aria-hidden className="hidden flex-col gap-3 md:flex">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
        <span role="status" className="sr-only">
          Loading navigation…
        </span>
      </PlainChrome>
    );
  }
  if (me === null) {
    return (
      <PlainChrome>
        <Link href="/login" className={cn(buttonVariants({ size: "sm" }), "w-fit")}>
          Sign in
        </Link>
      </PlainChrome>
    );
  }
  if (!me.synced) {
    return (
      <PlainChrome>
        <SignOutButton />
      </PlainChrome>
    );
  }
  return <SyncedChrome me={me} />;
}

/**
 * The signed-in layout: a sidebar beside the page on md and up, and a top bar
 * with a navigation drawer below it. The sidebar sits in its own error
 * boundary, because a failed account read there would otherwise take down
 * every page with it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <ErrorBoundary
        fallback={() => (
          <PlainChrome>
            <SignOutButton />
          </PlainChrome>
        )}
      >
        <ShellChrome />
      </ErrorBoundary>
      <SidebarPage className="flex min-w-0 flex-1 flex-col">{children}</SidebarPage>
    </div>
  );
}
