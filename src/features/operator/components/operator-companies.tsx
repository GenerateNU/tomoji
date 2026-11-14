"use client";

import { api } from "@convex/_generated/api";
import { RiAddLine } from "@remixicon/react";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { CompanyAvatar, getInitials } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useTablePage } from "../hooks/use-table-page";
import { formatDate, type DirectoryCompany } from "../lib/labels";
import { CompanyDetailModal } from "./company-detail-modal";
import {
  DirectorySearch,
  LoadingRows,
  NoResults,
  OperatorHeader,
  TablePager,
} from "./directory-chrome";
import { InviteModal, type InviteKind } from "./invite-modal";

const PAGE_SIZE = 10;

/** Columns that drop below md, so a phone shows the name and status without scrolling sideways. */
const secondaryColumn = "hidden md:table-cell";

/** Every company on the platform, searched by name. */
export function OperatorCompanies() {
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<DirectoryCompany | null>(null);
  const [inviteKinds, setInviteKinds] = useState<readonly InviteKind[] | null>(null);
  const term = useDebouncedValue(search.trim());

  const query = usePaginatedQuery(
    api.companies.list,
    { search: term || undefined },
    { initialNumItems: PAGE_SIZE },
  );
  const page = useTablePage(query, PAGE_SIZE, term);

  return (
    <div className="flex flex-col gap-8">
      <OperatorHeader
        title="Companies"
        description="Every company workspace, and whether it is still active."
        action={
          <Button onClick={() => setInviteKinds(["company"])}>
            <RiAddLine {...iconProps} />
            Invite company
          </Button>
        }
      />

      <DirectorySearch
        label="Search companies"
        placeholder="Search by company name"
        value={search}
        onChange={setSearch}
      />

      {page.empty ? (
        <NoResults>
          {term
            ? `No companies match “${term}”.`
            : "No companies yet. Invite one and it appears here straight away."}
        </NoResults>
      ) : (
        <div className="flex flex-col gap-4">
          <Table bare aria-label="Companies" className="md:min-w-[40rem]">
            <TableHeader divider>
              <TableHead>Company</TableHead>
              <TableHead className={secondaryColumn}>Industry</TableHead>
              <TableHead className={cn(secondaryColumn, "md:w-36")}>Added</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableHeader>
            <TableBody aria-busy={page.loading}>
              {page.loading ? (
                <LoadingRows columns={["", secondaryColumn, secondaryColumn, ""]} />
              ) : (
                page.rows.map((company) => (
                  <TableRow
                    key={company._id}
                    divider
                    onClick={() => setViewing(company)}
                    className="cursor-pointer hover:bg-gray-25"
                  >
                    <TableCell
                      avatar={<CompanyAvatar size={32} initials={getInitials(company.name)} />}
                      secondary={company.website ?? undefined}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewing(company);
                        }}
                        className={cn("cursor-pointer truncate rounded-xs text-left", focusRing)}
                      >
                        {company.name}
                      </button>
                    </TableCell>
                    <TableCell className={secondaryColumn}>{company.industry ?? "—"}</TableCell>
                    <TableCell className={secondaryColumn}>
                      {formatDate(company._creationTime)}
                    </TableCell>
                    <TableCell type="custom">
                      <Tag tone={company.isActive ? "primary" : "neutral"}>
                        {company.isActive ? "Active" : "Inactive"}
                      </Tag>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {page.loading && (
            <span role="status" className="sr-only">
              Loading companies…
            </span>
          )}
          <TablePager page={page} label="Companies" />
        </div>
      )}

      <CompanyDetailModal
        company={viewing}
        onClose={() => setViewing(null)}
        onInviteUser={() => {
          setViewing(null);
          setInviteKinds(["companyUser"]);
        }}
      />
      <InviteModal
        open={inviteKinds !== null}
        onOpenChange={(open) => {
          if (!open) setInviteKinds(null);
        }}
        kinds={inviteKinds ?? ["company"]}
      />
    </div>
  );
}
