import { Avatar, getInitials } from "@/components/ui/avatar";
import { useProfilePicture } from "@/features/profile/hooks/use-profile-picture";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { offerTime, type Offers } from "../lib/home";

/** A keyboard-accessible offer preview with private avatar fallback and its actual expiry. */
export function OfferRow({
  row,
  now,
  onClick,
}: {
  row: Offers["rows"][number];
  now: number;
  onClick: () => void;
}) {
  const picture = useProfilePicture(row.profilePictureMediaId ?? undefined);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded text-left hover:bg-gray-25",
        focusRing,
      )}
    >
      <Avatar size={24} initials={getInitials(row.creatorName)} src={picture.url} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium">{row.creatorName}</span>
        <span className="truncate text-body-sm text-gray-500">{row.opportunityTitle}</span>
      </span>
      <span className="shrink-0 text-body-sm text-gray-500">{offerTime(row.expiresAt, now)}</span>
    </button>
  );
}
