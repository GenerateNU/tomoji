"use client";

import { api } from "@convex/_generated/api";
import { FOLLOWER_RANGES } from "@convex/models/followerRanges";
import { RiCheckLine, RiInformationLine } from "@remixicon/react";
import { useQuery } from "convex/react";
import { Badge } from "@/components/ui/badge";
import { matchTag } from "../lib/feed-status";
import type { FeedOpportunity } from "../lib/types";

/**
 * How well the brief fits the creator, and what's missing. A creator below
 * the follower minimum or missing a skill can still apply, but can't claim
 * an open spot.
 */
export function MatchPanel({ opportunity }: { opportunity: FeedOpportunity }) {
  const skills = useQuery(api.skills.list, {});
  const niches = useQuery(api.niches.list, {});
  const tag = matchTag(opportunity);
  if (tag === null) return null;
  const { match } = opportunity;
  const label = (catalog: { name: string; label: string }[] | undefined, name: string) =>
    catalog?.find((entry) => entry.name === name)?.label ?? name;
  const minimum = FOLLOWER_RANGES.find((range) => range.name === opportunity.minFollowerRange);

  const gaps: string[] = [];
  if (match.meetsFollowerMinimum === false && minimum) {
    gaps.push(`This opportunity looks for a follower range of ${minimum.label}.`);
  }
  if (match.missingSkills.length > 0) {
    gaps.push(
      `It asks for ${match.missingSkills.map((name) => label(skills, name)).join(", ")}, which ${
        match.missingSkills.length === 1 ? "isn't" : "aren't"
      } on your profile.`,
    );
  }
  const matched = [
    ...match.matchedSkills.map((name) => label(skills, name)),
    ...match.matchedNiches.map((name) => label(niches, name)),
    ...(match.meetsFollowerMinimum && minimum ? [`${minimum.label} followers`] : []),
  ];

  return (
    <section
      aria-label="How well you match"
      className="flex flex-col gap-3 rounded-sm bg-gray-50 p-4 text-body-sm"
    >
      <div className="flex items-center gap-2">
        <Badge tone={tag.tone} size="md">
          {tag.label}
        </Badge>
        <span className="text-gray-700">Based on your profile</span>
      </div>
      {matched.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {matched.map((item) => (
            <Badge key={item} icon={RiCheckLine}>
              {item}
            </Badge>
          ))}
        </div>
      )}
      {gaps.length > 0 && (
        <div className="flex gap-2 text-gray-700">
          <RiInformationLine size={16} aria-hidden className="mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1">
            {gaps.map((gap) => (
              <p key={gap}>{gap}</p>
            ))}
            <p className="text-gray-500">
              {/* Gaps only appear when the creator isn't eligible. */}
              {opportunity.isGated
                ? "You can still apply."
                : "You need these to claim a spot, since claiming skips the company's review."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
