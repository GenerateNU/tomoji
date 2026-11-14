"use client";

import Link from "next/link";
import {
  RiAuctionFill,
  RiAuctionLine,
  RiBuilding2Fill,
  RiBuilding2Line,
  RiCheckboxMultipleFill,
  RiCheckboxMultipleLine,
  RiFolderFill,
  RiFolderLine,
  RiGroupFill,
  RiGroupLine,
  RiHome4Fill,
  RiHome4Line,
  RiInboxFill,
  RiInboxLine,
  RiLineChartFill,
  RiLineChartLine,
  RiPlayLargeFill,
  RiPlayLargeLine,
  RiSearchFill,
  RiSearchLine,
  RiWallet3Fill,
  RiWallet3Line,
  type RemixiconComponentType,
} from "@remixicon/react";
import { SpellingLogo } from "@/components/logo";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  SidebarToggle,
} from "@/components/ui/sidebar";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type NavEntry<Id extends string, SubId extends string = string> = {
  id: Id;
  label: string;
  icon: RemixiconComponentType;
  activeIcon: RemixiconComponentType;
  /** Where the item goes. An item with no destination yet is shown disabled. */
  href?: string;
  badge?: number;
  /** A secondary nav this item owns; it shows only while the item is selected. */
  subnav?: { label: string; items: readonly NavEntry<SubId>[] };
};

export const creatorNavItems = [
  { id: "home", label: "Home", icon: RiHome4Line, activeIcon: RiHome4Fill, href: "/" },
  {
    id: "opportunities",
    label: "Opportunities",
    icon: RiSearchLine,
    activeIcon: RiSearchFill,
    href: "/opportunities",
  },
  {
    id: "applications",
    label: "Applications",
    icon: RiInboxLine,
    activeIcon: RiInboxFill,
    href: "/applications",
  },
  {
    id: "assignments",
    label: "Assignments",
    icon: RiCheckboxMultipleLine,
    activeIcon: RiCheckboxMultipleFill,
    href: "/assignments",
  },
  { id: "posts", label: "Posts", icon: RiPlayLargeLine, activeIcon: RiPlayLargeFill },
  { id: "earnings", label: "Earnings", icon: RiWallet3Line, activeIcon: RiWallet3Fill },
  {
    id: "disputes",
    label: "Disputes",
    icon: RiAuctionLine,
    activeIcon: RiAuctionFill,
    href: "/disputes",
  },
] as const satisfies readonly NavEntry<string>[];

export const companyNavItems = [
  { id: "home", label: "Home", icon: RiHome4Line, activeIcon: RiHome4Fill, href: "/" },
  {
    id: "campaigns",
    label: "Campaigns",
    icon: RiFolderLine,
    activeIcon: RiFolderFill,
    href: "/campaigns",
  },
  { id: "applications", label: "Applications", icon: RiInboxLine, activeIcon: RiInboxFill },
  { id: "submissions", label: "Submissions", icon: RiPlayLargeLine, activeIcon: RiPlayLargeFill },
  { id: "analytics", label: "Analytics", icon: RiLineChartLine, activeIcon: RiLineChartFill },
  { id: "payout", label: "Pay out", icon: RiWallet3Line, activeIcon: RiWallet3Fill },
  { id: "disputes", label: "Disputes", icon: RiAuctionLine, activeIcon: RiAuctionFill },
] as const satisfies readonly NavEntry<string>[];

export const operatorNavItems = [
  { id: "home", label: "Home", icon: RiHome4Line, activeIcon: RiHome4Fill, href: "/" },
  {
    id: "users",
    label: "Users",
    icon: RiGroupLine,
    activeIcon: RiGroupFill,
    href: "/users",
  },
  {
    id: "companies",
    label: "Companies",
    icon: RiBuilding2Line,
    activeIcon: RiBuilding2Fill,
    href: "/companies",
  },
  {
    id: "disputes",
    label: "Disputes",
    icon: RiAuctionLine,
    activeIcon: RiAuctionFill,
    href: "/disputes",
  },
] as const satisfies readonly NavEntry<string>[];

/**
 * A nav of sidebar items. Items with an `href` are links and items without are
 * disabled. Pass `onSelect` for a demo nav instead: every item becomes a
 * "#" link whose click is cancelled and reported, so nothing navigates.
 */
export function NavItems<Id extends string>({
  items,
  activeId,
  muted,
  onSelect,
  onNavigate,
}: {
  items: readonly NavEntry<Id>[];
  activeId?: string;
  /** Marks the active item as the parent of an open secondary panel. */
  muted?: boolean;
  onSelect?: (id: Id) => void;
  /** Called when a link is followed, e.g. to close a drawer. */
  onNavigate?: () => void;
}) {
  return items.map(({ id, label, icon: Icon, activeIcon: ActiveIcon, badge, href }) => {
    const common = {
      active: id === activeId ? (muted ? ("parent" as const) : true) : false,
      icon: <Icon {...iconProps} />,
      activeIcon: <ActiveIcon {...iconProps} />,
      badge,
    };
    if (onSelect) {
      return (
        <SidebarItem
          key={id}
          {...common}
          href="#"
          onClick={(event) => {
            event.preventDefault();
            onSelect(id);
          }}
        >
          {label}
        </SidebarItem>
      );
    }
    if (href === undefined) {
      return (
        <SidebarItem key={id} {...common} disabled>
          {label}
        </SidebarItem>
      );
    }
    return (
      <SidebarItem
        key={id}
        {...common}
        render={<Link href={href} />}
        onClick={() => onNavigate?.()}
      >
        {label}
      </SidebarItem>
    );
  });
}

export type AccountMenuEntry =
  | { kind: "link"; id: string; label: string; icon: RemixiconComponentType; href: string }
  | {
      kind: "action";
      id: string;
      label: string;
      icon: RemixiconComponentType;
      onSelect: () => void;
    }
  | { kind: "separator"; id: string };

export type SidebarAccountInfo = {
  name: string;
  avatarSrc?: string;
  /** Shown at the top of the menu. */
  email?: string;
  items: readonly AccountMenuEntry[];
};

/** The account at the bottom of the sidebar, opening a menu of links and actions. */
export function AccountMenu({ name, avatarSrc, email, items }: SidebarAccountInfo) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarAccount avatar={<Avatar size={24} src={avatarSrc} />}>{name}</SidebarAccount>
        }
      />
      <DropdownMenuContent side="top" align="start" sideOffset={4}>
        {email ? (
          <div role="presentation" className="truncate px-2 py-1.5 text-body-sm text-gray-500">
            {email}
          </div>
        ) : null}
        {items.map((item) => {
          if (item.kind === "separator") return <DropdownMenuSeparator key={item.id} />;
          const Icon = item.icon;
          return item.kind === "link" ? (
            <DropdownMenuItem key={item.id} render={<Link href={item.href} />}>
              <Icon {...iconProps} />
              {item.label}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={item.id} onClick={item.onSelect}>
              <Icon {...iconProps} />
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The 200px nav column: logo, nav items, and the account menu. Presentational:
 * the caller picks the items, the active one, and what the account menu holds.
 */
export function AppSidebar<Id extends string>({
  items,
  activeId,
  account,
  collapsed,
  onCollapsedChange,
  onSelect,
  onNavigate,
  showToggle = true,
  logoHref,
  className,
}: {
  items: readonly NavEntry<Id>[];
  activeId?: string;
  account?: SidebarAccountInfo;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onSelect?: (id: Id) => void;
  onNavigate?: () => void;
  /** The fold button; drawers leave it out. */
  showToggle?: boolean;
  /** Makes the logo a link home. */
  logoHref?: string;
  className?: string;
}) {
  const logo = <SpellingLogo collapsed={collapsed} size={16} />;
  return (
    <Sidebar collapsed={collapsed} className={className}>
      <SidebarContent>
        <SidebarHeader>
          {logoHref ? (
            <Link
              href={logoHref}
              aria-label="ohani home"
              onClick={() => onNavigate?.()}
              className={cn("rounded-xs", focusRing)}
            >
              {logo}
            </Link>
          ) : (
            logo
          )}
          {showToggle ? <SidebarToggle onCollapsedChange={onCollapsedChange} /> : null}
        </SidebarHeader>
        <SidebarNav aria-label="Main">
          <NavItems items={items} activeId={activeId} onSelect={onSelect} onNavigate={onNavigate} />
        </SidebarNav>
      </SidebarContent>
      <SidebarFooter>{account ? <AccountMenu {...account} /> : null}</SidebarFooter>
    </Sidebar>
  );
}
