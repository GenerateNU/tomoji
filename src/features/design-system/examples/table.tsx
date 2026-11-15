"use client";

import { useState } from "react";
import { RiTimeLine } from "@remixicon/react";
import { CompanyAvatar } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SortIcon,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Example } from "@/features/design-system/components/docs/example";

type Sort = { key: string; dir: "ascending" | "descending" };

// The first click on a column sorts ascending; later clicks flip it. One column
// is sorted at a time, so the others fall back to "unsorted".
function useSort<T>(initial: Sort) {
  const [sort, setSort] = useState(initial);
  return {
    headProps: (key: string) => ({
      sort: sort.key === key ? sort.dir : ("unsorted" as const),
      onSort: () =>
        setSort((current) => ({
          key,
          dir: current.key === key && current.dir === "ascending" ? "descending" : "ascending",
        })),
    }),
    order: (rows: T[], get: (row: T) => string | number) =>
      [...rows].sort((a, b) => {
        const left = get(a);
        const right = get(b);
        const result =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right));
        return sort.dir === "ascending" ? result : -result;
      }),
    key: sort.key,
  };
}

const OFFERS = [
  { name: "Opus 5.5", company: "Anthropic", expires: 10, submitted: 10, base: 300, cpm: "4.00" },
  { name: "GPT-4.5", company: "OpenAI", expires: 5, submitted: 5, base: 500, cpm: "5.00" },
  { name: "Bard 2.0", company: "Google", expires: 3, submitted: 3, base: 250, cpm: "3.00" },
  { name: "LLaMA 2", company: "Meta", expires: 7, submitted: 7, base: 400, cpm: "4.50" },
];

const DISPUTES = [
  {
    name: "Design Workflow Walkthrough: From Brief to Final Cut",
    creator: "Michael",
    opportunity: "Claude Opus 5.5",
    created: "2026-10-12",
  },
  {
    name: "User Experience Research Findings: Key Insights",
    creator: "Alexandra",
    opportunity: "UX Research Pro 3.2",
    created: "2026-11-05",
  },
  {
    name: "Accessibility Audit Report: Improving Usability",
    creator: "Jordan",
    opportunity: "AccessPlus 2.1",
    created: "2026-09-20",
  },
  {
    name: "Feature Prioritization Matrix: Planning for Q1",
    creator: "Taylor",
    opportunity: "Strategic Planner 4.0",
    created: "2026-12-01",
  },
];

const CAMPAIGNS = [
  { name: "Opus 5.5", creators: 8, base: 800, cpm: 3300, spent: 4100, used: 0.35 },
  { name: "Opus Walkthrough", creators: 5, base: 500, cpm: 2250, spent: 2750, used: 0.85 },
  { name: "Opus Reaction", creators: 5, base: 100, cpm: 900, spent: 1000, used: 0.15 },
];

const dollars = (amount: number) => `$${amount.toLocaleString("en-US")}`;

function OffersTable() {
  const { headProps, order, key } = useSort<(typeof OFFERS)[number]>({
    key: "expires",
    dir: "descending",
  });
  return (
    <TableCard title="Offers" count={OFFERS.length} className="w-full max-w-[960px]">
      <TableHeader>
        <TableHead {...headProps("name")}>Name</TableHead>
        <TableHead {...headProps("expires")}>Expiration date</TableHead>
        <TableHead {...headProps("submitted")}>Submitted</TableHead>
        <TableHead {...headProps("base")}>Compensation</TableHead>
        <TableHead>
          <span className="sr-only">Actions</span>
        </TableHead>
      </TableHeader>
      <TableBody>
        {order(OFFERS, (offer) => offer[key as keyof typeof offer]).map((offer) => (
          <TableRow key={offer.name}>
            <TableCell avatar={<CompanyAvatar size={32} />} secondary={offer.company} star>
              {offer.name}
            </TableCell>
            <TableCell>in {offer.expires} days</TableCell>
            <TableCell>{offer.submitted} days ago</TableCell>
            <TableCell>
              ${offer.base} • ${offer.cpm} CPM
            </TableCell>
            <TableCell type="custom">
              <Button size="sm">View Offer</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  );
}

function DisputesTable() {
  const { headProps, order, key } = useSort<(typeof DISPUTES)[number]>({
    key: "created",
    dir: "descending",
  });
  return (
    <TableCard title="Active Disputes" count={DISPUTES.length} className="w-full max-w-[960px]">
      <TableHeader>
        <TableHead {...headProps("name")}>Name</TableHead>
        <TableHead {...headProps("creator")}>Creator</TableHead>
        <TableHead {...headProps("opportunity")}>Opportunity</TableHead>
        <TableHead {...headProps("created")}>Date Created</TableHead>
        <TableHead sort="unsorted">Status</TableHead>
      </TableHeader>
      <TableBody>
        {order(DISPUTES, (dispute) => dispute[key as keyof typeof dispute]).map((dispute) => (
          <TableRow key={dispute.name}>
            <TableCell>{dispute.name}</TableCell>
            <TableCell>{dispute.creator}</TableCell>
            <TableCell>{dispute.opportunity}</TableCell>
            <TableCell>
              {new Date(`${dispute.created}T12:00:00`).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </TableCell>
            <TableCell type="custom">
              <Tag icon={RiTimeLine}>Under Review</Tag>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  );
}

function CampaignsTable() {
  const { headProps, order, key } = useSort<(typeof CAMPAIGNS)[number]>({
    key: "spent",
    dir: "descending",
  });
  return (
    <div className="w-full max-w-[960px]">
      <Table aria-label="Campaign budgets">
        <TableHeader>
          <TableHead {...headProps("name")}>Campaign</TableHead>
          <TableHead {...headProps("creators")}>Creators</TableHead>
          <TableHead {...headProps("base")}>Base</TableHead>
          <TableHead {...headProps("cpm")}>CPM</TableHead>
          <TableHead {...headProps("spent")}>Spent</TableHead>
          <TableHead {...headProps("used")}>Budget used</TableHead>
        </TableHeader>
        <TableBody>
          {order(CAMPAIGNS, (campaign) => campaign[key as keyof typeof campaign]).map(
            (campaign) => (
              <TableRow key={campaign.name}>
                <TableCell>{campaign.name}</TableCell>
                <TableCell>{campaign.creators}</TableCell>
                <TableCell>{dollars(campaign.base)}</TableCell>
                <TableCell>{dollars(campaign.cpm)}</TableCell>
                <TableCell>{dollars(campaign.spent)}</TableCell>
                <TableCell type="custom">
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(campaign.used * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${campaign.name} budget used`}
                    className="h-1.5 w-[68px] overflow-hidden rounded-full bg-gray-100"
                  >
                    <div
                      className="h-full rounded-full bg-blue-primary"
                      style={{ width: `${campaign.used * 100}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function TableExamples() {
  return (
    <>
      <Example
        title="Offers"
        description="Avatar cells for the company, plain text cells, and a custom cell with a small button. Click a header to sort."
        canvasClassName="items-stretch"
        code={`<TableCard title="Offers" count={4}>
  <TableHeader>
    <TableHead sort="unsorted" onSort={…}>Name</TableHead>
    <TableHead sort="descending" onSort={…}>Expiration date</TableHead>
    <TableHead sort="unsorted" onSort={…}>Submitted</TableHead>
    <TableHead sort="unsorted" onSort={…}>Compensation</TableHead>
    <TableHead><span className="sr-only">Actions</span></TableHead>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell avatar={<CompanyAvatar size={32} />} secondary="Anthropic" star>Opus 5.5</TableCell>
      <TableCell>in 10 days</TableCell>
      <TableCell>10 days ago</TableCell>
      <TableCell>$300 • $4.00 CPM</TableCell>
      <TableCell type="custom"><Button size="sm">View Offer</Button></TableCell>
    </TableRow>
  </TableBody>
</TableCard>`}
      >
        <OffersTable />
      </Example>
      <Example
        title="Active Disputes"
        description="Long names truncate. Status is a custom cell holding a neutral tag."
        canvasClassName="items-stretch"
        code={`<TableRow>
  <TableCell>Design Workflow Walkthrough: From Brief to Final Cut</TableCell>
  <TableCell>Michael</TableCell>
  <TableCell>Claude Opus 5.5</TableCell>
  <TableCell>October 12, 2026</TableCell>
  <TableCell type="custom"><Tag icon={RiTimeLine}>Under Review</Tag></TableCell>
</TableRow>`}
      >
        <DisputesTable />
      </Example>
      <Example
        title="Campaign budget"
        description="No title (Show Title off). The last column is a custom cell with a progress bar."
        canvasClassName="items-stretch"
        code={`<Table aria-label="Campaign budgets">
  <TableHeader>…<TableHead sort="descending" onSort={…}>Spent</TableHead>…</TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Opus 5.5</TableCell>
      …
      <TableCell type="custom">{/* 68 × 6 blue bar on gray-100 */}</TableCell>
    </TableRow>
  </TableBody>
</Table>`}
      >
        <CampaignsTable />
      </Example>
      <Example
        title="Sort icon"
        code={`<SortIcon direction="none" />
<SortIcon direction="ascending" />
<SortIcon direction="descending" />`}
      >
        <SortIcon direction="none" />
        <SortIcon direction="ascending" />
        <SortIcon direction="descending" />
      </Example>
    </>
  );
}
