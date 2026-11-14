"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useConvexAuth, useQueries, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  RiAuctionLine,
  RiCheckboxMultipleLine,
  RiHome4Fill,
  RiHome4Line,
  RiInboxFill,
  RiInboxLine,
  RiNotification3Fill,
  RiNotification3Line,
  RiPlayLargeLine,
  RiSearchFill,
  RiSearchLine,
  RiSettings3Line,
  RiUser3Line,
  RiWallet3Line,
} from "@remixicon/react";
import { api } from "@convex/_generated/api";
import { ProfileDialog } from "@/features/profile/components/profile-dialog";
import { useProfilePicture } from "@/features/profile/hooks/use-profile-picture";
import { profileDisplayName } from "@/features/profile/lib/profile-display";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Logo, SpellingLogo } from "./logo";
import { Avatar, getInitials } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Sidebar,
  SidebarAccount,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  SidebarPage,
  SidebarToggle,
} from "./ui/sidebar";

type Account = Extract<FunctionReturnType<typeof api.users.me>, { synced: true }>;

const navigation = [
  { label: "Home", href: "/", icon: RiHome4Line, activeIcon: RiHome4Fill },
  { label: "Opportunities", href: "/opportunities", icon: RiSearchLine, activeIcon: RiSearchFill },
  { label: "Applications", href: "/applications", icon: RiInboxLine, activeIcon: RiInboxFill },
  { label: "Assignments", href: null, icon: RiCheckboxMultipleLine },
  { label: "Posts", href: null, icon: RiPlayLargeLine },
  { label: "Earnings", href: null, icon: RiWallet3Line },
  { label: "Disputes", href: null, icon: RiAuctionLine },
  {
    label: "Notifications",
    href: "/notifications",
    icon: RiNotification3Line,
    activeIcon: RiNotification3Fill,
  },
] as const;

/** Account-query errors must not hide navigation outside the page error boundary. */
export function AppShell({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const queries = useMemo(
    (): RequestForQueries =>
      !isLoading && isAuthenticated ? { me: { query: api.users.me, args: {} } } : {},
    [isLoading, isAuthenticated],
  );
  const { me }: { me?: FunctionReturnType<typeof api.users.me> | Error } = useQueries(queries);
  if (
    !isLoading &&
    isAuthenticated &&
    !(me instanceof Error) &&
    me?.synced &&
    me.role === "creator"
  ) {
    return (
      <CreatorShell key={me.userId} account={me}>
        {children}
      </CreatorShell>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      {fallback}
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

function AccountMenu({
  account,
  pictureUrl,
  onProfile,
}: {
  account: Account;
  pictureUrl?: string;
  onProfile: (trigger: HTMLElement | null) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const name = profileDisplayName(account);
  const nameParts = name.split(" ");
  const shortName =
    name === "Your profile"
      ? "Your account"
      : [nameParts[0], nameParts.length > 1 ? `${nameParts.at(-1)![0]}.` : ""]
          .filter(Boolean)
          .join(" ");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label="Account menu"
        render={
          <SidebarAccount
            avatar={
              <Avatar
                size={24}
                initials={name === "Your profile" ? undefined : getInitials(name)}
                src={pictureUrl}
              />
            }
          >
            {shortName}
          </SidebarAccount>
        }
      />
      <DropdownMenuContent side="top" align="start" sideOffset={4}>
        <DropdownMenuItem icon={RiUser3Line} onClick={() => onProfile(trigger.current)}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem icon={RiSettings3Line} render={<Link href="/settings" />}>
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreatorShell({ account, children }: { account: Account; children: ReactNode }) {
  const pathname = usePathname();
  const picture = useProfilePicture(account.profilePictureMediaId);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTrigger = useRef<HTMLElement | null>(null);
  function openProfile(trigger: HTMLElement | null) {
    profileTrigger.current = trigger;
    setProfileOpen(true);
  }
  return (
    <div className="flex min-h-dvh w-full">
      <a
        href="#main-content"
        className={cn(
          "sr-only z-50 rounded bg-background p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2",
          focusRing,
        )}
      >
        Skip to content
      </a>
      <div
        className={cn("sticky top-0 hidden h-dvh shrink-0 md:block", collapsed ? "w-14" : "w-50")}
      >
        <Sidebar collapsed={collapsed} className="absolute inset-y-0 left-0 z-20">
          <SidebarContent>
            <SidebarHeader>
              <Link href="/" aria-label="Ohani home" className={cn("rounded-xs", focusRing)}>
                <SpellingLogo collapsed={collapsed} size={16} />
              </Link>
              <SidebarToggle onCollapsedChange={setCollapsed} />
            </SidebarHeader>
            <SidebarNav aria-label="Main navigation">
              {navigation.map(({ label, href, icon: Icon, ...item }) =>
                href === null ? (
                  <SidebarItem
                    key={label}
                    render={<span />}
                    aria-disabled="true"
                    title={`${label} is not available yet`}
                    className="cursor-default opacity-50"
                    icon={<Icon {...iconProps} />}
                  >
                    {label}
                    <span className="sr-only"> (not available yet)</span>
                  </SidebarItem>
                ) : (
                  <SidebarItem
                    key={label}
                    render={<Link href={href} />}
                    active={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))}
                    icon={<Icon {...iconProps} />}
                    activeIcon={
                      "activeIcon" in item ? <item.activeIcon {...iconProps} /> : undefined
                    }
                  >
                    {label}
                  </SidebarItem>
                ),
              )}
            </SidebarNav>
          </SidebarContent>
          <SidebarFooter>
            <AccountMenu account={account} pictureUrl={picture.url} onProfile={openProfile} />
          </SidebarFooter>
        </Sidebar>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-gray-100 bg-gray-10 px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="Ohani home" className={cn("shrink-0 rounded-xs", focusRing)}>
              <Logo size={20} />
            </Link>
            <div className="min-w-0 max-w-44">
              <AccountMenu account={account} pictureUrl={picture.url} onProfile={openProfile} />
            </div>
          </div>
          <nav aria-label="Main navigation" className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {navigation
              .filter((item) => item.href !== null)
              .map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  className={cn(
                    "rounded py-1 text-body-sm text-gray-600 aria-[current=page]:font-medium aria-[current=page]:text-blue-primary",
                    focusRing,
                  )}
                >
                  {label}
                </Link>
              ))}
          </nav>
        </header>
        <SidebarPage id="main-content" tabIndex={-1} className="flex flex-col outline-none">
          {children}
        </SidebarPage>
      </div>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} finalFocus={profileTrigger} />
    </div>
  );
}
