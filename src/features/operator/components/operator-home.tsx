"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  RiAuctionLine,
  RiBuilding2Line,
  RiCheckboxMultipleLine,
  RiSearchLine,
  RiUser3Line,
} from "@remixicon/react";
import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { BarList } from "@/components/charts/bar-list";
import { Chart } from "@/components/charts/line-chart";
import { LegendItem } from "@/components/charts/legend";
import { StatTile } from "@/components/stat-tile";
import { Tag } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { iconProps } from "@/lib/icons";
import { useMe } from "@/features/users/hooks/use-me";
import { COMPANY_ACTIVITY, SIGNUPS } from "../lib/analytics-data";
import { formatCount } from "../lib/labels";
import { OperatorDisputesTable } from "./operator-disputes";
import { OperatorDisputeModal } from "./operator-dispute-modal";

const DISPUTES_ON_HOME = 5;

function Section({
  title,
  addon,
  children,
}: {
  title: string;
  addon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-body-lg font-medium text-gray-950">{title}</h2>
        {addon}
      </div>
      {children}
    </section>
  );
}

/** The operator landing page: platform counts, the open dispute queue, and trends. */
export function OperatorHome() {
  const me = useMe();
  const overview = useQuery(api.operators.overview, {});
  const [viewing, setViewing] = useState<Id<"disputes"> | null>(null);

  const tiles = [
    { key: "companies", label: "Companies", icon: <RiBuilding2Line {...iconProps} /> },
    { key: "activeCompanies", label: "Active companies", icon: <RiBuilding2Line {...iconProps} /> },
    { key: "activeCreators", label: "Active creators", icon: <RiUser3Line {...iconProps} /> },
    { key: "openDisputes", label: "Open disputes", icon: <RiAuctionLine {...iconProps} /> },
    { key: "openOpportunities", label: "Open briefs", icon: <RiSearchLine {...iconProps} /> },
    {
      key: "activeAssignments",
      label: "Active assignments",
      icon: <RiCheckboxMultipleLine {...iconProps} />,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-heading-lg font-medium text-gray-950">
          {me?.synced && me.firstName ? `Welcome, ${me.firstName}` : "Welcome"}
        </h1>
        <p className="text-body-sm text-gray-500">How Ohani is doing today.</p>
      </header>

      <section aria-label="Platform totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) =>
          overview === undefined ? (
            <Skeleton key={tile.key} className="h-[5.75rem] rounded" />
          ) : (
            <StatTile
              key={tile.key}
              label={tile.label}
              icon={tile.icon}
              value={formatCount(overview[tile.key])}
            />
          ),
        )}
        {overview === undefined && (
          <span role="status" className="sr-only">
            Loading platform totals…
          </span>
        )}
      </section>

      <Section
        title="Unresolved disputes"
        addon={
          overview && overview.openDisputes.value > 0 ? (
            <Tag tone="destructive">{formatCount(overview.openDisputes)} waiting</Tag>
          ) : null
        }
      >
        <OperatorDisputesTable
          status="open"
          label="Unresolved disputes"
          pageSize={DISPUTES_ON_HOME}
          onOpen={setViewing}
        />
      </Section>

      <div className="grid gap-8 xl:grid-cols-2">
        <Section title="Signups over time">
          <Chart
            className="rounded bg-gray-0 px-5 py-4 shadow-tile"
            aria-label="New creators and company users per week"
            values={[...SIGNUPS.creators]}
            compare={{ label: "Company users", values: [...SIGNUPS.companyUsers] }}
            labels={[...SIGNUPS.weeks]}
            seriesLabel="Creators"
            legend={
              <>
                <LegendItem>Creators</LegendItem>
                <LegendItem variant="context">Company users</LegendItem>
              </>
            }
          />
        </Section>

        <Section title="Companies by activity">
          <BarList
            aria-label="Companies ranked by active assignments"
            items={[...COMPANY_ACTIVITY]}
            seriesLabel="Active assignments"
          />
        </Section>
      </div>

      <OperatorDisputeModal disputeId={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
