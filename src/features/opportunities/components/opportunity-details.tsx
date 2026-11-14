"use client";

import { api } from "@convex/_generated/api";
import { FOLLOWER_RANGES } from "@convex/models/followerRanges";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDeadline, formatMoney, formatPay } from "../lib/format";
import type { FeedOpportunity } from "../lib/types";

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-body-sm text-gray-500">{label}</h3>
      {children}
    </section>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <p className="text-body-sm text-gray-500">None</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Badge key={tag} size="md" className="max-w-full whitespace-normal break-words">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function Paragraphs({ label, text }: { label: string; text: string }) {
  if (text.trim() === "") return null;
  return (
    <Section label={label}>
      <p className="text-body whitespace-pre-line text-gray-950">{text}</p>
    </Section>
  );
}

/** The brief inside the opportunity pop-up: pay, selections, and what the work involves. */
export function OpportunityDetails({ opportunity }: { opportunity: FeedOpportunity }) {
  const niches = useQuery(api.niches.list, {});
  const skills = useQuery(api.skills.list, {});
  const label = (catalog: { name: string; label: string }[] | undefined, name: string) =>
    catalog?.find((entry) => entry.name === name)?.label ?? name;
  const followerRange = FOLLOWER_RANGES.find(
    (range) => range.name === opportunity.minFollowerRange,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <p className="text-body text-gray-950">{opportunity.description}</p>
        <div className="flex flex-col gap-0.5">
          <p className="text-body-lg text-gray-950">{formatPay(opportunity)}</p>
          <p className="text-body-sm text-gray-500">
            Apply by {formatDeadline(opportunity.deadline)}
          </p>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Section label="Skills">
          <Tags tags={opportunity.skills.map((name) => label(skills, name))} />
        </Section>
        <Section label="Niche">
          <Tags tags={opportunity.niches.map((name) => label(niches, name))} />
        </Section>
        <Section label="Payment cap">
          <Tags
            tags={opportunity.paymentCapCents > 0 ? [formatMoney(opportunity.paymentCapCents)] : []}
          />
        </Section>
        <Section label="Follower range">
          <Tags tags={followerRange ? [followerRange.label] : ["Any"]} />
        </Section>
      </div>
      <Paragraphs label="Requirements" text={opportunity.contentRequirements} />
      <Paragraphs label="Content review policy" text={opportunity.reviewPolicy} />
    </div>
  );
}
