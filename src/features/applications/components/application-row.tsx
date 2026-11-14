"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { CompanyAvatar, getInitials } from "@/components/ui/avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { useCompanyLogo } from "@/hooks/use-company-logo";
import { formatCompensation } from "@/lib/money";
import { formatRelativeTime } from "@/lib/relative-time";
import { ApplicationStatusBadge } from "./application-status-badge";
import { StarToggle } from "./star-toggle";

export type ApplicationRowData = FunctionReturnType<
  typeof api.applications.searchMine
>["rows"][number];

/** A row whose company has gone missing still says so, rather than showing a blank. */
export function displayCompanyName(row: Pick<ApplicationRowData, "companyName">): string {
  return row.companyName || "Unknown company";
}

/** The company's logo, or its initials while the logo loads or if it can't be read. */
export function ApplicationCompanyAvatar({ row }: { row: ApplicationRowData }) {
  const logo = useCompanyLogo(row.companyLogoMediaId);
  return (
    <CompanyAvatar
      size={24}
      src={logo.url}
      initials={row.companyName ? getInitials(row.companyName) : undefined}
    />
  );
}

export function ApplicationStar({ row }: { row: ApplicationRowData }) {
  return (
    <StarToggle
      opportunityId={row.opportunityId}
      title={row.title}
      isStarred={row.isStarred}
      canStar={row.canStar}
    />
  );
}

/** Compensation in the compact form, with the full terms for screen readers and as a tooltip. */
export function ApplicationCompensation({ row }: { row: ApplicationRowData }) {
  const full = formatCompensation(row);
  return (
    <>
      <span aria-hidden title={full}>
        {formatCompensation(row, { variant: "compact" })}
      </span>
      <span className="sr-only">{full}</span>
    </>
  );
}

/** One application as a table row. Everything it shows comes with the row; it runs no queries. */
export function ApplicationRow({ row, now }: { row: ApplicationRowData; now: number }) {
  return (
    <TableRow>
      <TableCell type="custom">
        <span className="min-w-0 flex-1 truncate font-medium" title={row.title}>
          {row.title}
        </span>
        <ApplicationStar row={row} />
      </TableCell>
      <TableCell type="custom">
        <ApplicationCompanyAvatar row={row} />
        <span className="min-w-0 truncate" title={displayCompanyName(row)}>
          {displayCompanyName(row)}
        </span>
      </TableCell>
      <TableCell type="custom">
        <ApplicationStatusBadge status={row.status} />
      </TableCell>
      <TableCell>{formatRelativeTime(row.submittedAt, now)}</TableCell>
      <TableCell>
        <ApplicationCompensation row={row} />
      </TableCell>
    </TableRow>
  );
}
