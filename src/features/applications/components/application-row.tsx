"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CompanyAvatar } from "@/components/ui/avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { useCompanyLogo } from "@/hooks/use-company-logo";
import { formatCompensation } from "@/lib/money";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ApplicationTab } from "../hooks/use-applications-table";
import { formatRelativeTime } from "@/lib/relative-time";
import { ApplicationStatusBadge } from "./application-status-badge";
import { OfferExpiry } from "./offer-expiry";
import { StarToggle } from "./star-toggle";

export type ApplicationRowData = FunctionReturnType<
  typeof api.applications.searchMine
>["rows"][number];

/** A row whose company has gone missing still says so, rather than showing a blank. */
export function displayCompanyName(row: Pick<ApplicationRowData, "companyName">): string {
  return row.companyName || "Unknown company";
}

/** The company's logo, or the grey building placeholder while the logo loads or if it can't be read. */
export function ApplicationCompanyAvatar({ row }: { row: ApplicationRowData }) {
  const logo = useCompanyLogo(row.companyLogoMediaId);
  return <CompanyAvatar size={24} src={logo.url} />;
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

/**
 * The title as a button that opens the offer. `data-offer-title` lets the modal
 * return focus here when it closes, even if the row was opened by a click elsewhere on it.
 */
export function OfferTitleButton({
  row,
  onOpen,
  className,
}: {
  row: ApplicationRowData;
  onOpen: (applicationId: Id<"applications">) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-offer-title={row.applicationId}
      title={row.title}
      onClick={() => onOpen(row.applicationId)}
      className={cn(
        "min-w-0 cursor-pointer rounded-xs text-left font-medium hover:underline",
        focusRing,
        className,
      )}
    >
      {row.title}
    </button>
  );
}

/**
 * One application as a table row. Everything it shows comes with the row; it runs no queries.
 * On the Offers and Accepted tabs the title opens the offer, and so does a click anywhere else on the row.
 */
export function ApplicationRow({
  row,
  now,
  tab = "applications",
  onOpen,
}: {
  row: ApplicationRowData;
  now: number;
  tab?: ApplicationTab;
  onOpen?: (applicationId: Id<"applications">) => void;
}) {
  return (
    <TableRow
      className={onOpen && "cursor-pointer hover:bg-gray-25"}
      onClick={
        onOpen
          ? (event) => {
              // Buttons and links in the row do their own thing.
              if ((event.target as HTMLElement).closest("button, a")) return;
              onOpen(row.applicationId);
            }
          : undefined
      }
    >
      <TableCell type="custom">
        {onOpen ? (
          <OfferTitleButton row={row} onOpen={onOpen} className="truncate" />
        ) : (
          <span className="min-w-0 truncate font-medium" title={row.title}>
            {row.title}
          </span>
        )}
        {/* Sits right after the title, as in the design, not pushed to the cell's edge. */}
        <ApplicationStar row={row} />
      </TableCell>
      <TableCell type="custom">
        <ApplicationCompanyAvatar row={row} />
        <span className="min-w-0 truncate" title={displayCompanyName(row)}>
          {displayCompanyName(row)}
        </span>
      </TableCell>
      {tab === "accepted" ? (
        <TableCell>
          {row.offerAcceptedAt === undefined ? (
            "—"
          ) : (
            <span className="first-letter:uppercase">
              {formatRelativeTime(row.offerAcceptedAt, now)}
            </span>
          )}
        </TableCell>
      ) : (
        <>
          {tab === "offers" ? (
            <TableCell>
              <OfferExpiry status={row.status} offerExpiresAt={row.offerExpiresAt} now={now} />
            </TableCell>
          ) : (
            <TableCell type="custom">
              <ApplicationStatusBadge status={row.status} />
            </TableCell>
          )}
          <TableCell>{formatRelativeTime(row.submittedAt, now)}</TableCell>
        </>
      )}
      <TableCell>
        <ApplicationCompensation row={row} />
      </TableCell>
    </TableRow>
  );
}
