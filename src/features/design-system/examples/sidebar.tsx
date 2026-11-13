"use client";

import { useState, type ReactNode } from "react";
import {
  RiAuctionFill,
  RiAuctionLine,
  RiBriefcaseFill,
  RiBriefcaseLine,
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
  RiLayoutGridFill,
  RiLayoutGridLine,
  RiLineChartFill,
  RiLineChartLine,
  RiPlayLargeFill,
  RiPlayLargeLine,
  RiSearchFill,
  RiSearchLine,
  RiSettings3Fill,
  RiSettings3Line,
  RiUser3Line,
  RiWallet3Fill,
  RiWallet3Line,
  type RemixiconComponentType,
} from "@remixicon/react";
import { SpellingLogo } from "@/components/logo";
import { Avatar, CompanyAvatar } from "@/components/ui/avatar";
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
  SidebarGroup,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarNav,
  SidebarPage,
  SidebarPanel,
  SidebarToggle,
} from "@/components/ui/sidebar";
import { Example } from "@/features/design-system/components/docs/example";
import { iconProps } from "@/lib/icons";
import { cn } from "@/lib/utils";

type NavEntry<Id extends string> = {
  id: Id;
  label: string;
  icon: RemixiconComponentType;
  activeIcon: RemixiconComponentType;
};

export const creatorNavItems = [
  { id: "home", label: "Home", icon: RiHome4Line, activeIcon: RiHome4Fill },
  { id: "opportunities", label: "Opportunities", icon: RiSearchLine, activeIcon: RiSearchFill },
  { id: "applications", label: "Applications", icon: RiInboxLine, activeIcon: RiInboxFill },
  {
    id: "assignments",
    label: "Assignments",
    icon: RiCheckboxMultipleLine,
    activeIcon: RiCheckboxMultipleFill,
  },
  { id: "posts", label: "Posts", icon: RiPlayLargeLine, activeIcon: RiPlayLargeFill },
  { id: "earnings", label: "Earnings", icon: RiWallet3Line, activeIcon: RiWallet3Fill },
  { id: "disputes", label: "Disputes", icon: RiAuctionLine, activeIcon: RiAuctionFill },
] as const satisfies readonly NavEntry<string>[];

export const companyNavItems = [
  { id: "home", label: "Home", icon: RiHome4Line, activeIcon: RiHome4Fill },
  { id: "campaigns", label: "Campaigns", icon: RiFolderLine, activeIcon: RiFolderFill },
  { id: "applications", label: "Applications", icon: RiInboxLine, activeIcon: RiInboxFill },
  { id: "submissions", label: "Submissions", icon: RiPlayLargeLine, activeIcon: RiPlayLargeFill },
  { id: "analytics", label: "Analytics", icon: RiLineChartLine, activeIcon: RiLineChartFill },
  { id: "payout", label: "Pay out", icon: RiWallet3Line, activeIcon: RiWallet3Fill },
  { id: "disputes", label: "Disputes", icon: RiAuctionLine, activeIcon: RiAuctionFill },
] as const satisfies readonly NavEntry<string>[];

export const campaignNavItems = [
  { id: "overview", label: "Overview", icon: RiLayoutGridLine, activeIcon: RiLayoutGridFill },
  {
    id: "opportunities",
    label: "Opportunities",
    icon: RiBriefcaseLine,
    activeIcon: RiBriefcaseFill,
  },
  { id: "creators", label: "Creators", icon: RiGroupLine, activeIcon: RiGroupFill },
  { id: "analytics", label: "Analytics", icon: RiLineChartLine, activeIcon: RiLineChartFill },
  { id: "settings", label: "Settings", icon: RiSettings3Line, activeIcon: RiSettings3Fill },
] as const satisfies readonly NavEntry<string>[];

type CreatorNavId = (typeof creatorNavItems)[number]["id"];
type CompanyNavId = (typeof companyNavItems)[number]["id"];
type CampaignNavId = (typeof campaignNavItems)[number]["id"];
type AccountAction = "profile" | "settings";

function NavItems<Id extends string>({
  items,
  selected,
  muted,
  onSelect,
}: {
  items: readonly NavEntry<Id>[];
  selected: Id;
  muted?: boolean;
  onSelect?: (id: Id) => void;
}) {
  return items.map(({ id, label, icon: Icon, activeIcon: ActiveIcon }) => (
    <SidebarItem
      key={id}
      href="#"
      active={id === selected ? (muted ? "parent" : true) : false}
      icon={<Icon {...iconProps} />}
      activeIcon={<ActiveIcon {...iconProps} />}
      onClick={(event) => {
        event.preventDefault();
        onSelect?.(id);
      }}
    >
      {label}
    </SidebarItem>
  ));
}

function AccountMenu({
  name,
  avatarSrc,
  onAction,
}: {
  name: string;
  avatarSrc?: string;
  onAction?: (action: AccountAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarAccount avatar={<Avatar size={24} src={avatarSrc} />}>{name}</SidebarAccount>
        }
      />
      <DropdownMenuContent side="top" align="start" sideOffset={4}>
        <DropdownMenuItem onClick={() => onAction?.("profile")}>
          <RiUser3Line {...iconProps} />
          View profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction?.("settings")}>
          <RiSettings3Line {...iconProps} />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreatorSidebar({
  selected = "opportunities",
  onSelect,
  userName = "Linda A.",
  userAvatarSrc,
  onAccountAction,
  collapsed,
  onCollapsedChange,
  className,
}: {
  selected?: CreatorNavId;
  onSelect?: (id: CreatorNavId) => void;
  userName?: string;
  userAvatarSrc?: string;
  onAccountAction?: (action: AccountAction) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}) {
  return (
    <Sidebar collapsed={collapsed} className={className}>
      <SidebarContent>
        <SidebarHeader>
          <SpellingLogo collapsed={collapsed} size={16} />
          <SidebarToggle onCollapsedChange={onCollapsedChange} />
        </SidebarHeader>
        <SidebarNav aria-label="Main">
          <NavItems items={creatorNavItems} selected={selected} onSelect={onSelect} />
        </SidebarNav>
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu name={userName} avatarSrc={userAvatarSrc} onAction={onAccountAction} />
      </SidebarFooter>
    </Sidebar>
  );
}

function CompanySidebar({
  mode = "global",
  collapsed,
  onCollapsedChange,
  selected = "campaigns",
  onSelect,
  campaignSelected = "overview",
  onCampaignSelect,
  companyName = "Anthropic",
  companyLogoSrc,
  campaignName = "Opus 5.5",
  userName = "Bea T.",
  userAvatarSrc,
  onAccountAction,
  className,
}: {
  mode?: "global" | "campaign";
  /** Global: the rail. Campaign: hides the campaign panel. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  selected?: CompanyNavId;
  onSelect?: (id: CompanyNavId) => void;
  campaignSelected?: CampaignNavId;
  onCampaignSelect?: (id: CampaignNavId) => void;
  companyName?: string;
  companyLogoSrc?: string;
  campaignName?: string;
  userName?: string;
  userAvatarSrc?: string;
  onAccountAction?: (action: AccountAction) => void;
  className?: string;
}) {
  const logo = <CompanyAvatar size={24} src={companyLogoSrc} alt={companyName} />;
  const account = (
    <SidebarFooter>
      <AccountMenu name={userName} avatarSrc={userAvatarSrc} onAction={onAccountAction} />
    </SidebarFooter>
  );

  if (mode === "global") {
    return (
      <Sidebar collapsed={collapsed} className={className}>
        <SidebarContent>
          <SidebarHeader className="px-2">
            <span className="flex min-w-0 items-center gap-2">
              {logo}
              <SidebarLabel>{companyName}</SidebarLabel>
            </span>
            <SidebarToggle onCollapsedChange={onCollapsedChange} />
          </SidebarHeader>
          <SidebarNav aria-label="Main">
            <NavItems items={companyNavItems} selected={selected} onSelect={onSelect} />
          </SidebarNav>
        </SidebarContent>
        {account}
      </Sidebar>
    );
  }

  const panelOpen = !collapsed;
  return (
    <SidebarGroup className={className}>
      <Sidebar collapsed peek={panelOpen ? "panel" : "page"} className="border-r border-gray-50">
        <SidebarContent>
          <SidebarHeader className="px-2">
            {onCollapsedChange ? (
              <button
                type="button"
                aria-label={panelOpen ? "Collapse campaign panel" : "Expand campaign panel"}
                onClick={() => onCollapsedChange(panelOpen)}
                className="flex shrink-0 rounded outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25"
              >
                {logo}
              </button>
            ) : (
              logo
            )}
            <SidebarLabel className="flex-1">{companyName}</SidebarLabel>
          </SidebarHeader>
          <SidebarNav aria-label="Main">
            <NavItems
              items={companyNavItems}
              selected={selected}
              muted={panelOpen}
              onSelect={onSelect}
            />
          </SidebarNav>
        </SidebarContent>
        {account}
      </Sidebar>
      <SidebarPanel open={panelOpen}>
        <SidebarLabel className="block px-3">{campaignName}</SidebarLabel>
        <SidebarNav aria-label={campaignName}>
          <NavItems
            items={campaignNavItems}
            selected={campaignSelected}
            onSelect={onCampaignSelect}
          />
        </SidebarNav>
      </SidebarPanel>
    </SidebarGroup>
  );
}

function DemoWindow({
  title,
  sidebar,
  className,
}: {
  title: string;
  sidebar: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-0 shadow-overlay",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-gray-100 bg-gray-25 px-4">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
      </div>
      <div className="flex h-150">
        {sidebar}
        <SidebarPage className="flex flex-col gap-6 p-8">
          <h3 className="text-heading-md font-medium text-gray-950">{title}</h3>
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-24 rounded-lg bg-gray-50" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-10 rounded-lg bg-gray-25" />
            ))}
          </div>
        </SidebarPage>
      </div>
    </div>
  );
}

function labelOf<Id extends string>(items: readonly NavEntry<Id>[], id: Id) {
  return items.find((item) => item.id === id)?.label ?? "";
}

export function SidebarExamples() {
  const [creatorSelected, setCreatorSelected] = useState<CreatorNavId>("opportunities");
  const [creatorCollapsed, setCreatorCollapsed] = useState(false);
  const [companySelected, setCompanySelected] = useState<CompanyNavId>("campaigns");
  const [companyCollapsed, setCompanyCollapsed] = useState(false);
  const [campaignSelected, setCampaignSelected] = useState<CampaignNavId>("overview");
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  return (
    <>
      <Example
        title="Sidebar Item"
        description="Default, selected (blue bar, filled icon), with a badge, and collapsed. Hover shows a gray bar."
        canvasClassName="flex-col items-stretch"
        code={`<SidebarNav aria-label="Main">
  <SidebarItem href="/home" icon={<RiHome4Line {...iconProps} />}>Home</SidebarItem>
  <SidebarItem
    href="/home"
    active
    icon={<RiHome4Line {...iconProps} />}
    activeIcon={<RiHome4Fill {...iconProps} />}
  >
    Home
  </SidebarItem>
  <SidebarItem href="/applications" badge={3} icon={<RiInboxLine {...iconProps} />}>
    Applications
  </SidebarItem>
</SidebarNav>

{/* Inside a collapsed Sidebar the label fades out but stays in the markup. */}
<Sidebar collapsed>
  <SidebarNav aria-label="Main">
    <SidebarItem href="/home" icon={<RiHome4Line {...iconProps} />}>Home</SidebarItem>
  </SidebarNav>
</Sidebar>`}
      >
        <div className="flex w-50 flex-col gap-1">
          <SidebarNav aria-label="Sidebar item states">
            <SidebarItem href="#" icon={<RiHome4Line {...iconProps} />}>
              Home
            </SidebarItem>
            <SidebarItem
              href="#"
              active
              icon={<RiHome4Line {...iconProps} />}
              activeIcon={<RiHome4Fill {...iconProps} />}
            >
              Home
            </SidebarItem>
            <SidebarItem href="#" badge={3} icon={<RiInboxLine {...iconProps} />}>
              Applications
            </SidebarItem>
          </SidebarNav>
          <Sidebar collapsed className="h-auto bg-transparent">
            <SidebarNav aria-label="Collapsed sidebar item">
              <SidebarItem href="#" icon={<RiHome4Line {...iconProps} />}>
                Home
              </SidebarItem>
            </SidebarNav>
          </Sidebar>
        </div>
      </Example>
      <Example
        title="Creator Sidebar"
        description="Click items to select; the fold button collapses to the rail. Hover the rail to peek it open; its unfold button keeps it open."
        canvasClassName="items-stretch"
        code={`<Sidebar collapsed={collapsed}>
  <SidebarContent>
    <SidebarHeader>
      <SpellingLogo collapsed={collapsed} size={16} />
      <SidebarToggle onCollapsedChange={setCollapsed} />
    </SidebarHeader>
    <SidebarNav aria-label="Main">
      <SidebarItem href="/home" active icon={<RiHome4Line {...iconProps} />} activeIcon={<RiHome4Fill {...iconProps} />}>
        Home
      </SidebarItem>
      {/* …Opportunities, Applications, Assignments, Posts, Earnings, Disputes */}
    </SidebarNav>
  </SidebarContent>
  <SidebarFooter>
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarAccount avatar={<Avatar size={24} />}>Linda A.</SidebarAccount>}
      />
      <DropdownMenuContent side="top" align="start" sideOffset={4}>
        <DropdownMenuItem>View profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </SidebarFooter>
</Sidebar>`}
      >
        <DemoWindow
          title={labelOf(creatorNavItems, creatorSelected)}
          sidebar={
            <CreatorSidebar
              selected={creatorSelected}
              onSelect={setCreatorSelected}
              collapsed={creatorCollapsed}
              onCollapsedChange={setCreatorCollapsed}
            />
          }
        />
      </Example>
      <Example
        title="Company Sidebar — Global"
        canvasClassName="items-stretch"
        code={`<Sidebar collapsed={collapsed}>
  <SidebarContent>
    <SidebarHeader className="px-2">
      <span className="flex min-w-0 items-center gap-2">
        <CompanyAvatar size={24} alt="Anthropic" />
        <SidebarLabel>Anthropic</SidebarLabel>
      </span>
      <SidebarToggle onCollapsedChange={setCollapsed} />
    </SidebarHeader>
    <SidebarNav aria-label="Main">{/* SidebarItems */}</SidebarNav>
  </SidebarContent>
  <SidebarFooter>{/* account menu, as above (Bea T.) */}</SidebarFooter>
</Sidebar>`}
      >
        <DemoWindow
          title={labelOf(companyNavItems, companySelected)}
          sidebar={
            <CompanySidebar
              selected={companySelected}
              onSelect={setCompanySelected}
              collapsed={companyCollapsed}
              onCollapsedChange={setCompanyCollapsed}
            />
          }
        />
      </Example>
      <Example
        title="Company Sidebar — Campaign"
        description="Inside a campaign: the rail's selected item turns gray while the campaign panel is open. Click the company logo to toggle the panel."
        canvasClassName="items-stretch"
        code={`<SidebarGroup>
  <Sidebar collapsed peek={panelOpen ? "panel" : "page"} className="border-r border-gray-50">
    {/* header with the company logo as a button that toggles the panel,
        then nav items with active="parent" while the panel is open */}
  </Sidebar>
  <SidebarPanel open={panelOpen}>
    <SidebarLabel className="block px-3">Opus 5.5</SidebarLabel>
    <SidebarNav aria-label="Opus 5.5">{/* Overview, Opportunities, Creators… */}</SidebarNav>
  </SidebarPanel>
</SidebarGroup>`}
      >
        <DemoWindow
          title={labelOf(campaignNavItems, campaignSelected)}
          sidebar={
            <CompanySidebar
              mode="campaign"
              campaignSelected={campaignSelected}
              onCampaignSelect={setCampaignSelected}
              collapsed={panelCollapsed}
              onCollapsedChange={setPanelCollapsed}
            />
          }
        />
      </Example>
    </>
  );
}
