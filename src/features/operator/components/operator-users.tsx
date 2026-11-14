"use client";

import { api } from "@convex/_generated/api";
import { RiAddLine } from "@remixicon/react";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useTablePage } from "../hooks/use-table-page";
import { formatDate, userName, type DirectoryUser } from "../lib/labels";
import {
  DirectorySearch,
  LoadingRows,
  NoResults,
  OperatorHeader,
  TablePager,
} from "./directory-chrome";
import { InviteModal } from "./invite-modal";
import { UserDetailModal } from "./user-detail-modal";

const PAGE_SIZE = 10;

/** Columns that drop below md, so a phone shows the name and status without scrolling sideways. */
const secondaryColumn = "hidden md:table-cell";

const TABS = [
  { role: "creator", label: "Creators", empty: "creators" },
  { role: "company", label: "Company users", empty: "company users" },
  { role: "operator", label: "Operators", empty: "operators" },
] as const;

type Role = (typeof TABS)[number]["role"];

/** The directory: one tab per account type, searched by name or email. */
export function OperatorUsers() {
  const [role, setRole] = useState<Role>("creator");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [viewing, setViewing] = useState<DirectoryUser | null>(null);
  const term = useDebouncedValue(search.trim());

  return (
    <div className="flex flex-col gap-8">
      <OperatorHeader
        title="Users"
        description="Every account on Ohani, by type."
        action={
          <Button onClick={() => setInviting(true)}>
            <RiAddLine {...iconProps} />
            Invite
          </Button>
        }
      />

      <Tabs value={role} onValueChange={(value) => setRole(value as Role)} className="gap-6">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.role} value={tab.role}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <DirectorySearch
            label="Search users"
            placeholder="Search by name or email"
            value={search}
            onChange={setSearch}
          />
          <Label className="flex items-center gap-2 text-body-sm text-gray-700">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(checked) => setIncludeInactive(checked === true)}
            />
            Show deactivated accounts
          </Label>
        </div>

        {TABS.map((tab) => (
          <TabsContent key={tab.role} value={tab.role}>
            {role === tab.role && (
              <UsersTable
                role={tab.role}
                label={tab.label}
                emptyNoun={tab.empty}
                search={term}
                includeInactive={includeInactive}
                onOpen={setViewing}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <InviteModal open={inviting} onOpenChange={setInviting} kinds={["creator", "companyUser"]} />
      <UserDetailModal user={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function UsersTable({
  role,
  label,
  emptyNoun,
  search,
  includeInactive,
  onOpen,
}: {
  role: Role;
  label: string;
  emptyNoun: string;
  search: string;
  includeInactive: boolean;
  onOpen: (user: DirectoryUser) => void;
}) {
  const query = usePaginatedQuery(
    api.users.list,
    { role, search: search || undefined, includeInactive: includeInactive || undefined },
    { initialNumItems: PAGE_SIZE },
  );
  const page = useTablePage(query, PAGE_SIZE, `${role}:${search}:${includeInactive}`);
  const showCompany = role === "company";

  if (page.empty) {
    return (
      <NoResults>
        {search
          ? `No ${emptyNoun} match “${search}”.`
          : `No ${emptyNoun} yet. Invitations show up here once they're accepted.`}
      </NoResults>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table bare aria-label={label} className="md:min-w-[40rem]">
        <TableHeader divider>
          <TableHead>Name</TableHead>
          {showCompany && <TableHead className={secondaryColumn}>Company</TableHead>}
          <TableHead className={cn(secondaryColumn, "md:w-36")}>Joined</TableHead>
          <TableHead className="w-32">Status</TableHead>
        </TableHeader>
        <TableBody aria-busy={page.loading}>
          {page.loading ? (
            <LoadingRows columns={["", showCompany && secondaryColumn, secondaryColumn, ""]} />
          ) : (
            page.rows.map((user) => (
              <TableRow
                key={user._id}
                divider
                onClick={() => onOpen(user)}
                className="cursor-pointer hover:bg-gray-25"
              >
                <TableCell
                  avatar={<Avatar size={32} initials={getInitials(userName(user))} />}
                  secondary={user.email}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(user);
                    }}
                    className={cn("cursor-pointer truncate rounded-xs text-left", focusRing)}
                  >
                    {userName(user)}
                  </button>
                </TableCell>
                {showCompany && (
                  <TableCell className={secondaryColumn}>
                    {user.company
                      ? `${user.company.name} · ${user.company.role === "admin" ? "Admin" : "Member"}`
                      : "—"}
                  </TableCell>
                )}
                <TableCell className={secondaryColumn}>{formatDate(user._creationTime)}</TableCell>
                <TableCell type="custom">
                  <Tag tone={user.isActive ? "primary" : "neutral"}>
                    {user.isActive ? "Active" : "Deactivated"}
                  </Tag>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {page.loading && (
        <span role="status" className="sr-only">
          Loading {label.toLowerCase()}…
        </span>
      )}
      <TablePager page={page} label={label} />
    </div>
  );
}
