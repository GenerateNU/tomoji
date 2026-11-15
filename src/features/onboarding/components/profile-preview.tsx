"use client";

import Image from "next/image";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import {
  RiCakeLine,
  RiExternalLinkLine,
  RiFlagLine,
  RiGithubFill,
  RiLinkedinBoxFill,
  RiTranslate2,
  RiTwitterXLine,
} from "@remixicon/react";
import type { Id } from "@convex/_generated/dataModel";
import { useRef } from "react";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { useProfilePicture } from "@/features/profile/hooks/use-profile-picture";
import { useOverflowCount } from "@/hooks/use-overflow-count";
import { focusRing } from "@/lib/styles";
import { iconProps, type IconComponent } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useOnboardingDraft } from "../hooks/use-onboarding-draft";
import { normalizeLink, parseBirthdate } from "../lib/validation";

/** Whole years between `birthdate` and now, or null when the date isn't complete. */
function ageFrom(birthdate: string): number | null {
  const timestamp = parseBirthdate(birthdate);
  if (timestamp === null) return null;
  const born = new Date(timestamp);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** A grey bar standing in for a value the creator hasn't entered yet. */
function Placeholder({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-2.5 rounded-full bg-gray-100", className)} />;
}

/** One of the three facts under the name: filled in, or a bar until it is. */
function Fact({
  icon: Icon,
  value,
  placeholderWidth,
}: {
  icon: IconComponent;
  value: string | null;
  placeholderWidth: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-body-sm font-normal text-gray-700">
      <Icon {...iconProps} className="shrink-0 text-gray-500" />
      {value === null ? <Placeholder className={placeholderWidth} /> : <span>{value}</span>}
    </span>
  );
}

/**
 * A row of tags clamped to one line, with the rest summarised as `+N`. Every
 * tag stays rendered so the measurement cannot feed back into itself; the
 * extras are simply clipped.
 */
function Section({
  label,
  values,
  placeholderWidth,
}: {
  label: string;
  values: string[];
  placeholderWidth: string;
}) {
  const row = useRef<HTMLUListElement>(null);
  const overflow = useOverflowCount(row, values.join("\u0000"));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm font-normal text-gray-500">{label}</p>
      {values.length === 0 ? (
        <Placeholder className={placeholderWidth} />
      ) : (
        <div className="relative">
          <ul
            ref={row}
            className="flex h-8 flex-wrap gap-2 overflow-hidden"
            // The clipped tags are still read out, so the count is decoration.
            aria-label={values.join(", ")}
          >
            {values.map((value) => (
              <li
                key={value}
                className="h-8 shrink-0 rounded-sm bg-gray-50 px-2 py-1.5 text-body-sm font-normal text-gray-700"
              >
                {value}
              </li>
            ))}
          </ul>
          {overflow.count > 0 && (
            // Spans to the right edge so it also hides the tag it displaces.
            <span
              aria-hidden
              style={{ left: overflow.left }}
              className="absolute inset-y-0 right-0 flex items-center bg-gray-0 pl-2 text-body-sm font-normal text-gray-500"
            >
              +{overflow.count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SocialIcon({
  icon: Icon,
  label,
  href,
}: {
  icon: IconComponent;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-sm bg-blue-subtle text-blue-primary transition-opacity hover:opacity-80",
        focusRing,
      )}
    >
      <Icon {...iconProps} size={18} aria-hidden />
      <span className="sr-only">{label}</span>
    </a>
  );
}

/**
 * The profile a company will see, filling in as the creator types. It reads
 * the draft rather than the saved profile so every keystroke shows, which is
 * why it only runs inside the onboarding flow.
 */
export function ProfilePreview({
  name,
  xUsername,
  joinedAt,
  pictureMediaId,
  pictureUrl,
}: {
  name: string;
  /** The linked X handle, or null when the creator hasn't connected one. */
  xUsername: string | null;
  /** Unix ms the account was created; shown as "Joined November 2026". */
  joinedAt: number;
  /** The saved picture, fetched here so every step shows it. */
  pictureMediaId?: Id<"mediaUploads">;
  /** A just-chosen picture, shown before the upload finishes. */
  pictureUrl?: string;
}) {
  const { draft } = useOnboardingDraft();
  const saved = useProfilePicture(pictureMediaId);
  const countries = useQuery(api.countries.list, {});
  const allNiches = useQuery(api.niches.list, {});
  const allSkills = useQuery(api.skills.list, {});
  const allLanguages = useQuery(api.languages.list, {});

  const labelsOf = (
    names: string[],
    catalog: { name: string; label: string }[] | undefined,
  ): string[] => {
    const labels = new Map(catalog?.map((option) => [option.name, option.label]));
    return names.map((value) => labels.get(value) ?? value);
  };

  const age = ageFrom(draft.birthdate);
  const country = countries?.find((entry) => entry.code === draft.countryOfResidence);
  const languages = labelsOf(draft.languages, allLanguages);
  const github = normalizeLink(draft.githubLink);
  const linkedin = normalizeLink(draft.linkedinLink);
  const extraLinks = draft.additionalLinks
    .map((link) => ({ raw: link.trim(), href: normalizeLink(link) }))
    .filter((link): link is { raw: string; href: string } => link.href !== null);

  return (
    <article
      aria-label="Profile preview"
      className="w-full max-w-[34rem] overflow-hidden rounded-lg bg-gray-0 shadow-tile"
    >
      <div className="relative h-44 w-full bg-blue-primary">
        <Image
          src="/onboarding/default-banner.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 34rem, 100vw"
          className="object-cover"
          priority
        />
      </div>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Avatar size={48} initials={getInitials(name)} src={pictureUrl ?? saved?.url} alt="" />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-body-lg font-medium text-gray-950">{name}</p>
            <p className="text-body-sm font-normal text-gray-500">
              Joined{" "}
              {new Date(joinedAt).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Fact
            icon={RiCakeLine}
            value={age === null ? null : String(age)}
            placeholderWidth="w-8"
          />
          <Fact icon={RiFlagLine} value={country?.name ?? null} placeholderWidth="w-28" />
          <Fact
            icon={RiTranslate2}
            value={languages.length === 0 ? null : languages.join(", ")}
            placeholderWidth="w-32"
          />
        </div>

        <Section
          label="Niches"
          values={labelsOf(draft.niches, allNiches)}
          placeholderWidth="w-56"
        />
        <Section
          label="Skills"
          values={labelsOf(draft.skills, allSkills)}
          placeholderWidth="w-44"
        />

        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-normal text-gray-500">Social links</p>
          <div className="flex flex-wrap items-center gap-2">
            {xUsername !== null && (
              <SocialIcon
                icon={RiTwitterXLine}
                label={`X (@${xUsername})`}
                href={`https://x.com/${encodeURIComponent(xUsername)}`}
              />
            )}
            {github !== null && <SocialIcon icon={RiGithubFill} label="GitHub" href={github} />}
            {linkedin !== null && (
              <SocialIcon icon={RiLinkedinBoxFill} label="LinkedIn" href={linkedin} />
            )}
            {extraLinks.map((link) => (
              <a
                key={link.raw}
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(
                  "flex items-center gap-1.5 rounded-sm bg-blue-subtle px-2 py-1.5 text-body-sm font-normal text-blue-primary transition-opacity hover:opacity-80",
                  focusRing,
                )}
              >
                <RiExternalLinkLine {...iconProps} size={14} aria-hidden />
                <span className="max-w-40 truncate">{link.raw}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
