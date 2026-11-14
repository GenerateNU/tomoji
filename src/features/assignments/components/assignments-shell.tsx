"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  RiCheckboxMultipleLine,
  RiHome4Line,
  RiInboxLine,
  RiNotification3Line,
  RiSearchLine,
} from "@remixicon/react";
import { signOutAction } from "@/app/auth/actions";
import { SpellingLogo } from "@/components/logo";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/sidebar";
import { useMe } from "@/features/users/hooks/use-me";

const links = [
  { href: "/", label: "Home", Icon: RiHome4Line },
  { href: "/opportunities", label: "Opportunities", Icon: RiSearchLine },
  { href: "/applications", label: "Applications", Icon: RiInboxLine },
  { href: "/assignments", label: "Assignments", Icon: RiCheckboxMultipleLine },
  { href: "/notifications", label: "Notifications", Icon: RiNotification3Line },
];

/** Uses the creator workspace shell for assignments and keeps the shared header elsewhere. */
export function AssignmentsShell({ children, header }: { children: ReactNode; header: ReactNode }) {
  const path = usePathname();
  const isAssignments = path === "/assignments" || path.startsWith("/assignments/");
  return isAssignments ? (
    <CreatorWorkspace>{children}</CreatorWorkspace>
  ) : (
    <div className="flex flex-1 flex-col">
      {header}
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

/** Shows the signed-in routes available to a creator. */
function CreatorWorkspace({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const me = useMe();
  const name = me?.synced
    ? [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email
    : undefined;
  return (
    <div className="flex min-h-dvh flex-col bg-gray-0 md:flex-row">
      <Sidebar collapsed={collapsed} className="sticky top-0 hidden h-dvh md:block">
        <SidebarContent>
          <SidebarHeader className="mb-1">
            <Link href="/" aria-label="Home">
              <SpellingLogo size={15} collapsed={collapsed} />
            </Link>
            <SidebarToggle onCollapsedChange={setCollapsed} />
          </SidebarHeader>
          <SidebarNav aria-label="Main navigation">
            {links.map(({ href, label, Icon }) => (
              <SidebarItem
                key={href}
                render={<Link href={href} />}
                active={href === "/assignments"}
                icon={<Icon aria-hidden />}
              >
                {label}
              </SidebarItem>
            ))}
          </SidebarNav>
        </SidebarContent>
        {name && (
          <SidebarFooter>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarAccount avatar={<Avatar size={24} initials={getInitials(name)} />}>
                    {name}
                  </SidebarAccount>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuItem render={<Link href="/profile" />}>Profile</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
                <form action={signOutAction}>
                  <Button
                    type="submit"
                    variant="secondary-ghost"
                    size="sm"
                    className="w-full justify-start"
                  >
                    Sign out
                  </Button>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        )}
      </Sidebar>
      <nav
        aria-label="Main navigation"
        className="flex items-center gap-4 overflow-x-auto border-b px-4 py-3 text-sm md:hidden"
      >
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={href === "/assignments" ? "page" : undefined}
            className="shrink-0 py-2 aria-[current=page]:font-medium aria-[current=page]:text-primary"
          >
            {label}
          </Link>
        ))}
        <Link href="/settings" className="shrink-0 py-2">
          Settings
        </Link>
      </nav>
      <SidebarPage className="shadow-none">{children}</SidebarPage>
    </div>
  );
}
