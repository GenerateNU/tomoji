"use client";

import type { CreatorOpportunity } from "@convex/models/opportunities";
import { useCatalogLabels } from "../hooks/use-catalog-labels";
import { Section } from "./section";
import { Tags } from "./tags";

/** Displays niches, skills, and languages separately using their shared catalog labels. */
export function OpportunityTags({
  niches,
  skills,
  languages,
}: Pick<CreatorOpportunity, "niches" | "skills" | "languages">) {
  const labels = useCatalogLabels();
  return (
    <>
      <Section label="Niches">
        <Tags tags={niches.map(labels.niche)} />
      </Section>
      <Section label="Skills">
        <Tags tags={skills.map(labels.skill)} />
      </Section>
      <Section label="Languages">
        <Tags tags={languages.map(labels.language)} />
      </Section>
    </>
  );
}
