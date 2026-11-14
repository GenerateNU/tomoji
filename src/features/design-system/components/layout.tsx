"use client";

import { useState, type ReactNode } from "react";
import {
  BriefcaseBusinessIcon,
  ChartColumnIcon,
  ClockIcon,
  CopyCheckIcon,
  FolderIcon,
  GavelIcon,
  Grid2x2Icon,
  HouseIcon,
  InboxIcon,
  PanelLeftIcon,
  SearchIcon,
  SettingsIcon,
  SquarePlayIcon,
  StarIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarAccount,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table";
import { PreviewSection } from "./preview-section";

const COMPANY_NAV = [
  { label: "Home", icon: <HouseIcon /> },
  { label: "Campaigns", icon: <FolderIcon />, active: true },
  { label: "Applications", icon: <InboxIcon />, badge: 3 },
  { label: "Assignments", icon: <SquarePlayIcon /> },
  { label: "Analytics", icon: <ChartColumnIcon /> },
  { label: "Pay out", icon: <WalletIcon /> },
  { label: "Disputes", icon: <GavelIcon /> },
];

const CREATOR_NAV = [
  { label: "Home", icon: <HouseIcon /> },
  { label: "Opportunities", icon: <SearchIcon />, active: true },
  { label: "Applications", icon: <InboxIcon /> },
  { label: "Assignments", icon: <CopyCheckIcon /> },
  { label: "Posts", icon: <SquarePlayIcon /> },
  { label: "Earnings", icon: <WalletIcon /> },
  { label: "Disputes", icon: <GavelIcon /> },
];

const CAMPAIGN_NAV = [
  { label: "Overview", icon: <Grid2x2Icon />, active: true },
  { label: "Opportunities", icon: <BriefcaseBusinessIcon /> },
  { label: "Creators", icon: <UsersIcon /> },
  { label: "Analytics", icon: <ChartColumnIcon /> },
  { label: "Settings", icon: <SettingsIcon /> },
];

type NavEntry = { label: string; icon: ReactNode; active?: boolean; badge?: number };

function NavItems({ items }: { items: NavEntry[] }) {
  return items.map((item) => (
    <SidebarItem
      key={item.label}
      href="#sidebar"
      icon={item.icon}
      active={item.active}
      badge={item.badge}
    >
      {item.label}
    </SidebarItem>
  ));
}

function CompanyLogo() {
  return (
    <Avatar size="sm" shape="square">
      <AvatarFallback />
    </Avatar>
  );
}

function Account({ name }: { name: string }) {
  return (
    <SidebarFooter>
      <SidebarAccount
        avatar={
          <Avatar size="sm">
            <AvatarFallback />
          </Avatar>
        }
      >
        {name}
      </SidebarAccount>
    </SidebarFooter>
  );
}

/** Collapses or expands a preview sidebar from its header. */
function CollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="-m-2"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onClick={onToggle}
    >
      <PanelLeftIcon />
    </Button>
  );
}

export function SidebarPreview() {
  const [creatorCollapsed, setCreatorCollapsed] = useState(false);
  const [companyCollapsed, setCompanyCollapsed] = useState(false);

  return (
    <PreviewSection
      id="sidebar"
      title="Sidebar"
      description="App navigation. Creators and companies each get a sidebar that collapses to an icon rail. Inside a campaign, the company rail sits beside a campaign panel."
    >
      <div className="flex h-[560px] gap-6 overflow-x-auto rounded-lg border border-border bg-neutral-50 p-4">
        <Sidebar collapsed={creatorCollapsed} className="rounded-md border">
          <SidebarContent>
            <SidebarHeader>
              {!creatorCollapsed && (
                <span className="text-body-lg font-medium text-neutral-900">ohani</span>
              )}
              <CollapseButton
                collapsed={creatorCollapsed}
                onToggle={() => setCreatorCollapsed((value) => !value)}
              />
            </SidebarHeader>
            <SidebarNav aria-label="Creator">
              <NavItems items={CREATOR_NAV} />
            </SidebarNav>
          </SidebarContent>
          <Account name="Linda A." />
        </Sidebar>

        <Sidebar collapsed={companyCollapsed} className="rounded-md border">
          <SidebarContent>
            <SidebarHeader>
              {companyCollapsed ? (
                // The rail has room only for the logo, so the logo expands it.
                <button
                  type="button"
                  aria-label="Expand sidebar"
                  className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => setCompanyCollapsed(false)}
                >
                  <CompanyLogo />
                </button>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <CompanyLogo />
                    <span className="truncate font-medium">Anthropic</span>
                  </span>
                  <CollapseButton collapsed={false} onToggle={() => setCompanyCollapsed(true)} />
                </>
              )}
            </SidebarHeader>
            <SidebarNav aria-label="Company">
              <NavItems items={COMPANY_NAV} />
            </SidebarNav>
          </SidebarContent>
          <Account name="Bea T." />
        </Sidebar>

        <div className="flex shrink-0 overflow-hidden rounded-md border">
          <Sidebar collapsed>
            <SidebarContent>
              <SidebarHeader>
                <CompanyLogo />
                <span className="sr-only">Anthropic</span>
              </SidebarHeader>
              <SidebarNav aria-label="Company">
                <NavItems items={COMPANY_NAV} />
              </SidebarNav>
            </SidebarContent>
            <Account name="Bea T." />
          </Sidebar>
          <Sidebar className="w-44 justify-start">
            <SidebarHeader>
              <span className="truncate font-medium">Opus 5.5</span>
            </SidebarHeader>
            <SidebarNav aria-label="Campaign">
              <NavItems items={CAMPAIGN_NAV} />
            </SidebarNav>
          </Sidebar>
        </div>
      </div>
    </PreviewSection>
  );
}

const OFFERS = [
  {
    title: "Claude Opus 5.5",
    company: "Anthropic",
    expires: "in 10 days",
    submitted: "10 days ago",
    pay: "$300 • $4.00 CPM",
  },
  {
    title: "GPT-4.5",
    company: "OpenAI",
    expires: "in 5 days",
    submitted: "5 days ago",
    pay: "$500 • $5.00 CPM",
  },
  {
    title: "Bard 2.0",
    company: "Google",
    expires: "in 3 days",
    submitted: "3 days ago",
    pay: "$250 • $3.00 CPM",
  },
  {
    title: "LLaMA 2",
    company: "Meta",
    expires: "in 7 days",
    submitted: "7 days ago",
    pay: "$400 • $4.50 CPM",
  },
];

const DISPUTES = [
  {
    name: "Design Workflow Walkthrough: From Brief to Final Cut",
    creator: "Michael",
    opportunity: "Claude Opus 5.5",
    created: "October 12, 2026",
  },
  {
    name: "User Experience Research Findings: Key Insights",
    creator: "Alexandra",
    opportunity: "UX Research Pro 3.2",
    created: "November 5, 2026",
  },
  {
    name: "Accessibility Audit Report: Improving Usability",
    creator: "Jordan",
    opportunity: "AccessPlus 2.1",
    created: "September 20, 2026",
  },
];

const BUDGETS = [
  { campaign: "Opus 5.5", creators: 8, base: "$800", cpm: "$3,300", spent: "$4,100", used: 38 },
  {
    campaign: "Opus Walkthrough",
    creators: 5,
    base: "$500",
    cpm: "$2,250",
    spent: "$2,750",
    used: 88,
  },
  { campaign: "Opus Reaction", creators: 5, base: "$100", cpm: "$900", spent: "$1,000", used: 15 },
];

type SortDirection = "ascending" | "descending";

/** A header cell that sorts its column; clicking flips between descending and ascending. */
function SortableHead({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: string;
  sort: { column: string; direction: SortDirection };
  onSort: (column: string) => void;
  className?: string;
}) {
  const direction = sort.column === column ? sort.direction : undefined;
  return (
    <TableHead aria-sort={direction ?? "none"} className={className}>
      <TableSortButton direction={direction} onClick={() => onSort(column)}>
        {label}
      </TableSortButton>
    </TableHead>
  );
}

function useSort(initial: string) {
  const [sort, setSort] = useState<{ column: string; direction: SortDirection }>({
    column: initial,
    direction: "descending",
  });
  function onSort(column: string) {
    setSort((current) => ({
      column,
      direction:
        current.column === column && current.direction === "descending"
          ? "ascending"
          : "descending",
    }));
  }
  return { sort, onSort };
}

export function TablePreview() {
  const offers = useSort("expires");
  const disputes = useSort("created");
  const budgets = useSort("spent");

  return (
    <PreviewSection
      id="table"
      title="Table"
      description="Lists records with sortable columns. Cells hold text, an avatar with two lines, or any component such as a tag, button, or progress bar. Long text truncates."
    >
      <Table className="min-w-[56rem] table-fixed">
        <TableCaption>
          Offers <span className="text-muted-foreground">({OFFERS.length})</span>
        </TableCaption>
        <TableHeader>
          <TableRow>
            <SortableHead label="Name" column="name" className="w-80" {...offers} />
            <SortableHead label="Expiration date" column="expires" {...offers} />
            <SortableHead label="Submitted" column="submitted" {...offers} />
            <SortableHead label="Compensation" column="pay" {...offers} />
            <TableHead className="w-28">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {OFFERS.map((offer) => (
            <TableRow key={offer.title}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar size="lg" shape="square">
                    <AvatarFallback />
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate">{offer.title}</span>
                      <StarIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="truncate text-body-sm font-normal text-muted-foreground">
                      {offer.company}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>{offer.expires}</TableCell>
              <TableCell>{offer.submitted}</TableCell>
              <TableCell>{offer.pay}</TableCell>
              <TableCell className="text-right">
                <Button>View Offer</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Table className="min-w-[56rem] table-fixed">
        <TableCaption>
          Active Disputes <span className="text-muted-foreground">({DISPUTES.length})</span>
        </TableCaption>
        <TableHeader>
          <TableRow>
            <SortableHead label="Name" column="name" className="w-80" {...disputes} />
            <SortableHead label="Creator" column="creator" {...disputes} />
            <SortableHead label="Opportunity" column="opportunity" {...disputes} />
            <SortableHead label="Date Created" column="created" {...disputes} />
            <SortableHead label="Status" column="status" className="w-40" {...disputes} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {DISPUTES.map((dispute) => (
            <TableRow key={dispute.name}>
              <TableCell className="truncate">{dispute.name}</TableCell>
              <TableCell>{dispute.creator}</TableCell>
              <TableCell>{dispute.opportunity}</TableCell>
              <TableCell>{dispute.created}</TableCell>
              <TableCell>
                <Badge size="md">
                  <ClockIcon />
                  Under Review
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Table className="min-w-[56rem] table-fixed">
        <TableHeader>
          <TableRow>
            <SortableHead label="Campaign" column="campaign" className="w-52" {...budgets} />
            <SortableHead label="Creators" column="creators" {...budgets} />
            <SortableHead label="Base" column="base" {...budgets} />
            <SortableHead label="CPM" column="cpm" {...budgets} />
            <SortableHead label="Spent" column="spent" {...budgets} />
            <SortableHead label="Budget used" column="used" className="w-40" {...budgets} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {BUDGETS.map((budget) => (
            <TableRow key={budget.campaign}>
              <TableCell>{budget.campaign}</TableCell>
              <TableCell>{budget.creators}</TableCell>
              <TableCell>{budget.base}</TableCell>
              <TableCell>{budget.cpm}</TableCell>
              <TableCell>{budget.spent}</TableCell>
              <TableCell>
                <Progress
                  className="w-35"
                  value={budget.used}
                  aria-label={`${budget.campaign} budget used`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PreviewSection>
  );
}
