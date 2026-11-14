"use client";

import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import type { ReactNode } from "react";
import { Modal } from "@/components/modal";
import { CompanyAvatar, getInitials } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, userName, type DirectoryCompany } from "../lib/labels";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-body font-medium text-gray-500">{label}</dt>
      <dd className="text-body-sm break-words text-gray-950">{children}</dd>
    </div>
  );
}

const MEMBER_LIMIT = 10;

/** A company's profile and the accounts that belong to it. */
export function CompanyDetailModal({
  company,
  onClose,
  onInviteUser,
}: {
  company: DirectoryCompany | null;
  onClose: () => void;
  onInviteUser: () => void;
}) {
  // Company users are listed by searching the directory for this company; the
  // directory joins each one's membership, so no extra endpoint is needed.
  const { results, status } = usePaginatedQuery(
    api.users.list,
    company === null ? "skip" : { role: "company", includeInactive: true },
    { initialNumItems: 100 },
  );
  const members =
    company === null ? [] : results.filter((user) => user.company?.companyId === company._id);
  const loading = status === "LoadingFirstPage";

  return (
    <Modal
      open={company !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      titleSize="lg"
      title={company?.name ?? ""}
      titleAddon={
        company && !company.isActive ? (
          <Tag size="md" tone="destructive">
            Inactive
          </Tag>
        ) : null
      }
      className="sm:max-w-[36rem]"
      footer={<Button onClick={onInviteUser}>Invite a user</Button>}
    >
      {company && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <CompanyAvatar size={48} initials={getInitials(company.name)} />
            <span className="min-w-0 truncate text-body-sm text-gray-500">
              Added {formatDate(company._creationTime)}
            </span>
          </div>
          <Separator />
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
            <Fact label="Status">{company.isActive ? "Active" : "Inactive"}</Fact>
            <Fact label="Industry">{company.industry ?? "—"}</Fact>
            <Fact label="Country">{company.countryOfResidence ?? "—"}</Fact>
            <Fact label="Website">
              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-4"
                >
                  {company.website}
                </a>
              ) : (
                "—"
              )}
            </Fact>
          </dl>
          {company.description && (
            <section className="flex flex-col gap-2">
              <h3 className="text-body font-medium text-gray-500">About</h3>
              <p className="text-body-sm whitespace-pre-line text-gray-950">
                {company.description}
              </p>
            </section>
          )}
          <Separator />
          <section className="flex flex-col gap-3">
            <h3 className="text-body font-medium text-gray-500">
              Members {!loading && `(${members.length})`}
            </h3>
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-6 w-40" />
                <span className="sr-only" role="status">
                  Loading members…
                </span>
              </div>
            ) : members.length === 0 ? (
              <p className="text-body-sm text-gray-500">
                Nobody has accepted an invitation to this company yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {members.slice(0, MEMBER_LIMIT).map((member) => (
                  <li
                    key={member._id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate text-body-sm text-gray-950">
                      {userName(member)} <span className="text-gray-500">{member.email}</span>
                    </span>
                    <Tag tone={member.isActive ? "neutral" : "destructive"}>
                      {member.company?.role === "admin" ? "Admin" : "Member"}
                      {member.isActive ? "" : " · deactivated"}
                    </Tag>
                  </li>
                ))}
                {members.length > MEMBER_LIMIT && (
                  <li className="text-body-sm text-gray-500">
                    and {members.length - MEMBER_LIMIT} more
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
