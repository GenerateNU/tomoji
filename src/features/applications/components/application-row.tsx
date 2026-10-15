"use client";

import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { applicationExpiresAt, formatCompensation, formatRelativeTime } from "../lib/format";
import { ApplicationStatusBadge } from "./application-status-badge";

type Opportunity = FunctionReturnType<typeof api.opportunities.get>;

/**
 * One application with its opportunity. Creators can only load an opportunity
 * while it's open, so a closed or paused one comes back as an error and the
 * row shows what the application itself knows. `useQueries` returns that error
 * instead of throwing, so one closed opportunity doesn't break the page.
 */
export function ApplicationRow({
  application,
  now,
}: {
  application: Doc<"applications">;
  now: number;
}) {
  const { opportunityId } = application;
  // useQueries resubscribes whenever it gets a new object, which loops on every
  // render, so the request must be memoized. useQuery does this internally.
  const queries = useMemo(
    () => ({ opportunity: { query: api.opportunities.get, args: { opportunityId } } }),
    [opportunityId],
  );
  const { opportunity } = useQueries(queries) as {
    opportunity: Opportunity | Error | undefined;
  };

  const loading = opportunity === undefined;
  const brief = opportunity instanceof Error || loading ? null : opportunity;
  const companyName = brief !== null && "companyName" in brief ? brief.companyName : null;
  const expiresAt = applicationExpiresAt(application, brief?.deadline);

  return (
    <tr className="align-middle">
      <td className="py-2.5 pr-5">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-muted text-lg font-medium text-muted-foreground"
          >
            {companyName?.charAt(0).toUpperCase()}
          </div>
          {loading ? (
            <div className="flex flex-col gap-2">
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          ) : brief !== null ? (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xl font-medium">{brief.title}</span>
              <span className="text-base">{companyName}</span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1 text-muted-foreground">
              <span className="text-xl font-medium">Opportunity no longer available</span>
              <span className="text-base">It has closed or been paused.</span>
            </div>
          )}
        </div>
      </td>
      <td className="py-2.5 pr-5">
        <ApplicationStatusBadge status={application.status} />
      </td>
      <td className="py-2.5 pr-5 text-base font-medium whitespace-nowrap">
        {formatRelativeTime(application._creationTime, now)}
      </td>
      <td className="py-2.5 pr-5 text-base font-medium whitespace-nowrap">
        {expiresAt === null ? "—" : formatRelativeTime(expiresAt, now)}
      </td>
      <td className="py-2.5 text-base font-medium">
        {brief === null ? "—" : formatCompensation(brief)}
      </td>
    </tr>
  );
}
