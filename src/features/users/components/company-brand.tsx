"use client";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { CompanyAvatar } from "@/components/ui/avatar";
import { useProfilePicture } from "@/features/profile/hooks/use-profile-picture";

/** The active company's name and logo, without changing creator or staff branding. */
export function CompanyBrand({ collapsed = false }: { collapsed?: boolean }) {
  const company = useQuery(api.companies.me, {});
  const picture = useProfilePicture(company?.profilePictureMediaId);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CompanyAvatar size={24} src={picture.url} />
      {!collapsed && (
        <span className="truncate text-body font-medium text-gray-950">
          {company?.name ?? "Company"}
        </span>
      )}
    </span>
  );
}
