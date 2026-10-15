"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Section } from "./section";
import { Tags } from "./tags";

/** The opportunity's niches, shown as skills. Labels come from the niche list. */
export function SkillTags({ niches }: { niches: string[] }) {
  const allNiches = useQuery(api.niches.list);
  const labels = new Map<string, string>(allNiches?.map((niche) => [niche.name, niche.label]));
  return (
    <Section label="Skills">
      <Tags tags={niches.map((name) => labels.get(name) ?? name)} />
    </Section>
  );
}
