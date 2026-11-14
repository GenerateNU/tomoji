"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  RiAddLine,
  RiCake2Line,
  RiEditLine,
  RiExternalLinkLine,
  RiFlagLine,
  RiGithubFill,
  RiHeartLine,
  RiLinkedinBoxFill,
  RiTranslate2,
  RiTwitterXLine,
  RiUser3Line,
} from "@remixicon/react";
import { api } from "@convex/_generated/api";
import { COUNTRIES } from "@convex/models/countries";
import { LANGUAGES } from "@convex/models/languages";
import { NICHES } from "@convex/models/niches";
import { SKILLS } from "@convex/models/skills";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { parseGithubLink } from "../lib/github-link";
import { parseAdditionalLinks, parseLinkedinLink } from "../lib/links";
import { ageFromBirthdate } from "../lib/profile-display";
import { PREVIEW_CONTENT_TYPES, PROFILE_PREVIEW } from "../lib/profile-preview";
import { CreatorProfileForm } from "./creator-profile-form";
import { CreatorProfileHeader } from "./creator-profile-header";
import { ProfileSkeleton } from "./profile-skeleton";

type Profile = FunctionReturnType<typeof api.creators.me>;

function SocialLink({
  href,
  label,
  icon: Icon,
  children,
}: {
  href: string;
  label: string;
  icon: IconComponent;
  children?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      className={cn(
        "inline-flex min-h-9 min-w-9 max-w-full items-center justify-center gap-2 rounded-sm bg-blue-subtle px-2.5 py-2 text-body-sm font-medium text-blue-primary hover:bg-blue-subtle/70",
        focusRing,
      )}
    >
      <Icon {...iconProps} className="shrink-0" />
      {children && <span className="min-w-0 wrap-anywhere">{children}</span>}
    </a>
  );
}

function ProfileView({
  profile,
  contentTypes,
  onEdit,
}: {
  profile: Profile;
  contentTypes: string[];
  onEdit: () => void;
}) {
  const countryName =
    COUNTRIES.find((entry) => entry.code === profile.countryOfResidence)?.name ??
    profile.countryOfResidence;
  const [now] = useState(() => Date.now());
  const age = ageFromBirthdate(profile.dateOfBirth, now);
  const github = parseGithubLink(profile.githubLink ?? "");
  const linkedin = parseLinkedinLink(profile.linkedinLink ?? "");
  const otherLinks = profile.additionalLinks.filter((link) => parseAdditionalLinks([link]).ok);
  const hasX = profile.xId !== undefined && /^\d+$/.test(profile.xId);
  const hasLinks =
    hasX || (github.ok && github.value) || (linkedin.ok && linkedin.value) || otherLinks.length > 0;
  const invalidLinks =
    !github.ok || !linkedin.ok || otherLinks.length !== profile.additionalLinks.length;

  return (
    <>
      <CreatorProfileHeader profile={profile} />
      <div className="space-y-7 px-6 py-6 sm:px-8">
        <ul
          aria-label="Personal details"
          className="flex flex-wrap gap-x-5 gap-y-3 text-body-sm text-gray-700"
        >
          {age !== null && (
            <li className="flex items-center gap-1.5">
              <RiCake2Line {...iconProps} />
              <span>{age} years old</span>
            </li>
          )}
          {countryName && (
            <li className="flex items-center gap-1.5">
              <RiFlagLine {...iconProps} />
              <span>{countryName}</span>
            </li>
          )}
          {profile.languages.length > 0 && (
            <li className="flex items-center gap-1.5">
              <RiTranslate2 {...iconProps} />
              <span>
                {profile.languages
                  .map((name) => LANGUAGES.find((option) => option.name === name)?.label ?? name)
                  .join(", ")}
              </span>
            </li>
          )}
        </ul>
        <section aria-label="Preview statistics" className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Followers"
            value={PROFILE_PREVIEW.followers}
            icon={<RiUser3Line {...iconProps} />}
          />
          <StatTile
            label="Posts"
            value={PROFILE_PREVIEW.posts}
            icon={<RiAddLine {...iconProps} />}
          />
          <StatTile
            label="Avg. likes per post"
            value={PROFILE_PREVIEW.averageLikes}
            icon={<RiHeartLine {...iconProps} />}
          />
        </section>
        <dl className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <dt className="text-body-sm text-gray-500">Niches</dt>
            <dd className="flex flex-wrap gap-2">
              {profile.niches.length === 0 ? (
                <span className="text-body-sm text-gray-500">No niches selected.</span>
              ) : (
                profile.niches.map((name) => (
                  <Badge
                    key={name}
                    size="md"
                    className="max-w-full whitespace-normal wrap-anywhere"
                  >
                    {NICHES.find((option) => option.name === name)?.label ?? name}
                  </Badge>
                ))
              )}
            </dd>
          </div>
          <div className="space-y-2">
            <dt className="text-body-sm text-gray-500">Skills</dt>
            <dd className="flex flex-wrap gap-2">
              {profile.skills.length === 0 ? (
                <span className="text-body-sm text-gray-500">No skills selected.</span>
              ) : (
                profile.skills.map((name) => (
                  <Badge
                    key={name}
                    size="md"
                    className="max-w-full whitespace-normal wrap-anywhere"
                  >
                    {SKILLS.find((option) => option.name === name)?.label ?? name}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        </dl>
        <section aria-label="Content type" className="space-y-2">
          <h3 className="text-body-sm font-normal text-gray-500">Content type</h3>
          <div className="flex flex-wrap gap-2">
            {contentTypes.length === 0 ? (
              <p className="text-body-sm text-gray-500">No content types selected.</p>
            ) : (
              contentTypes.map((value) => (
                <Badge key={value} size="md">
                  {PREVIEW_CONTENT_TYPES.find((option) => option.value === value)?.label ?? value}
                </Badge>
              ))
            )}
          </div>
        </section>
        <section aria-label="Social links" className="space-y-2">
          <h3 className="text-body-sm font-normal text-gray-500">Social links</h3>
          <div className="flex flex-wrap gap-2">
            {hasX && (
              <SocialLink
                href={`https://x.com/i/user/${profile.xId}`}
                label="X profile"
                icon={RiTwitterXLine}
              />
            )}
            {github.ok && github.value && (
              <SocialLink href={github.value} label="GitHub profile" icon={RiGithubFill} />
            )}
            {linkedin.ok && linkedin.value && (
              <SocialLink href={linkedin.value} label="LinkedIn profile" icon={RiLinkedinBoxFill} />
            )}
            {otherLinks.map((link, index) => (
              <SocialLink
                key={`${index}-${link}`}
                href={link}
                label={`Portfolio link: ${link}`}
                icon={RiExternalLinkLine}
              >
                {link.replace(/^https:\/\//, "")}
              </SocialLink>
            ))}
          </div>
          {!hasLinks && <p className="text-body-sm text-gray-500">No social links added yet.</p>}
          {invalidLinks && (
            <p className="text-body-sm text-gray-500">
              Some saved links need updating. Edit your profile to correct them.
            </p>
          )}
        </section>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary-subtle"
            size="sm"
            icon={RiEditLine}
            onClick={onEdit}
          >
            Edit
          </Button>
        </div>
      </div>
    </>
  );
}

/** The same own-profile view and editor serve the page and account-menu dialog. */
export function CreatorProfile({
  onPendingChange,
}: {
  onPendingChange?: (pending: boolean) => void;
}) {
  const result = useQuery(api.creators.me, {});
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState("");
  const [contentTypes, setContentTypes] = useState<string[]>([...PROFILE_PREVIEW.contentTypes]);
  if (result === undefined) return <ProfileSkeleton />;

  // Older deployments may omit collections that the current API defaults to [].
  // Normalize once so the view and editor share the same comparison baseline.
  const profile: Profile = {
    ...result,
    additionalLinks: result.additionalLinks ?? [],
    languages: result.languages ?? [],
    niches: result.niches ?? [],
    skills: result.skills ?? [],
  };

  return (
    <div className="flex min-h-0 flex-col rounded-lg bg-gray-0 text-gray-950">
      {editing ? (
        <CreatorProfileForm
          profile={profile}
          previewContentTypes={contentTypes}
          onCancel={() => setEditing(false)}
          onSaved={(nextContentTypes, persisted) => {
            setContentTypes(nextContentTypes);
            setEditing(false);
            setSaved(persisted ? "Profile saved." : "Preview updated for this visit.");
          }}
          onPendingChange={onPendingChange}
        />
      ) : (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
          <ProfileView
            profile={profile}
            contentTypes={contentTypes}
            onEdit={() => {
              setSaved("");
              setEditing(true);
            }}
          />
          {saved && (
            <p role="status" className="sr-only">
              {saved}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
