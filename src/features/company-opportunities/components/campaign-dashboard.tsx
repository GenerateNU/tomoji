"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  RiArrowLeftSLine,
  RiBriefcase4Line,
  RiGroupLine,
  RiLineChartLine,
  RiSettings3Line,
} from "@remixicon/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAccount } from "@/features/users/components/require-account";
import { errorCode } from "@/lib/errors";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { CampaignOpportunities } from "./campaign-opportunities";

type Section = { label: string; icon: IconComponent; active?: boolean };

// Only Opportunities exists so far; the rest show as "coming soon".
const SECTIONS: Section[] = [
  { label: "Opportunities", icon: RiBriefcase4Line, active: true },
  { label: "Creators", icon: RiGroupLine },
  { label: "Analytics", icon: RiLineChartLine },
  { label: "Settings", icon: RiSettings3Line },
];

function CampaignNav({ title }: { title: string | undefined }) {
  return (
    <nav
      aria-label="Campaign"
      className="flex shrink-0 flex-col gap-4 border-gray-100 px-4 pt-6 max-md:border-b md:w-52 md:border-r md:px-3 md:py-8"
    >
      <Link
        href="/campaigns"
        className={cn(
          "flex w-fit items-center gap-0.5 rounded-xs text-body-sm text-gray-500 hover:text-gray-950",
          focusRing,
        )}
      >
        <RiArrowLeftSLine {...iconProps} />
        Campaigns
      </Link>
      {title === undefined ? (
        <Skeleton className="h-6 w-32" aria-label="Loading campaign" />
      ) : (
        <p className="truncate px-2 text-body-lg font-medium text-gray-950">{title}</p>
      )}
      <ul className="flex gap-1 overflow-x-auto max-md:-mx-4 max-md:px-4 max-md:pb-2 md:flex-col">
        {SECTIONS.map(({ label, icon: Icon, active }) => (
          <li key={label} className="shrink-0">
            {active ? (
              <span
                aria-current="page"
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-body font-medium text-gray-950 md:border-l-2 md:border-blue-primary md:rounded-l-none"
              >
                <Icon {...iconProps} />
                {label}
              </span>
            ) : (
              <span
                aria-disabled="true"
                title="Coming soon"
                className="flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-body text-gray-400"
              >
                <Icon {...iconProps} />
                {label}
                <span className="sr-only"> (coming soon)</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Dashboard({ campaignId }: { campaignId: Id<"campaigns"> }) {
  const campaign = useQuery(api.campaigns.get, { campaignId });
  return (
    <div className="flex w-full flex-col md:min-h-svh md:flex-row">
      <CampaignNav title={campaign?.title} />
      <CampaignOpportunities
        campaignId={campaignId}
        // Opportunities can only be added while the campaign takes them.
        canCreate={campaign !== undefined && campaign.status !== "closed"}
        // TODO: open the opportunity detail modal (features/company-opportunities/modal).
        onOpen={() => {}}
      />
    </div>
  );
}

function CampaignUnavailable({ missing, onRetry }: { missing: boolean; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 px-4 py-24 text-center sm:px-10 lg:px-16"
    >
      <h1 className="text-heading-sm text-gray-950">
        {missing ? "We couldn’t find this campaign" : "This campaign didn’t load"}
      </h1>
      <p className="text-body text-gray-500">
        {missing
          ? "It may have been removed, or it belongs to another company."
          : "Check your connection and try again."}
      </p>
      <div className="flex gap-3">
        {!missing && <Button onClick={onRetry}>Try again</Button>}
        <Button variant="secondary-subtle" render={<Link href="/campaigns" />} nativeButton={false}>
          Back to campaigns
        </Button>
      </div>
    </div>
  );
}

/**
 * One campaign's workspace: its name and sections down the side, and its
 * opportunities by status. A bad or foreign id shows a not-found message
 * instead of taking the page down.
 */
export function CampaignDashboard({ campaignId }: { campaignId: string }) {
  return (
    <RequireAccount
      role="company"
      next={`/campaigns/${campaignId}`}
      wrongRole="A company account is required to view campaigns."
      loading="Loading campaign…"
      unsynced="We’re finishing setting up your account."
    >
      <GuardedDashboard campaignId={campaignId} />
    </RequireAccount>
  );
}

function GuardedDashboard({ campaignId }: { campaignId: string }) {
  // Remounting the boundary is what clears a failed read.
  const [attempt, setAttempt] = useState(0);
  return (
    <ErrorBoundary
      key={attempt}
      fallback={(error) => (
        <CampaignUnavailable
          // An id that isn't a campaign id fails argument validation, which has no code.
          missing={errorCode(error) === "not_found" || errorCode(error) === null}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      )}
    >
      <Dashboard campaignId={campaignId as Id<"campaigns">} />
    </ErrorBoundary>
  );
}
