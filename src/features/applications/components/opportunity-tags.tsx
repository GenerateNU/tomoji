"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import type { CreatorOpportunity } from "@convex/models/opportunities";
import { Section } from "./section";
import { Tags } from "./tags";

/** Displays niches, skills, and languages separately using their shared catalog labels. */
export function OpportunityTags({
  niches,
  skills,
  languages,
}: Pick<CreatorOpportunity, "niches" | "skills" | "languages">) {
  const allNiches = useQuery(api.niches.list, {});
  const allSkills = useQuery(api.skills.list, {});
  const allLanguages = useQuery(api.languages.list, {});
  const nicheLabels = new Map<string, string>(allNiches?.map((niche) => [niche.name, niche.label]));
  const skillLabels = new Map<string, string>(allSkills?.map((skill) => [skill.name, skill.label]));
  const languageLabels = new Map<string, string>(
    allLanguages?.map((language) => [language.name, language.label]),
  );
  return (
    <>
      <Section label="Niches">
        <Tags tags={niches.map((name) => nicheLabels.get(name) ?? name)} />
      </Section>
      <Section label="Skills">
        <Tags tags={skills.map((name) => skillLabels.get(name) ?? name)} />
      </Section>
      <Section label="Languages">
        <Tags tags={languages.map((name) => languageLabels.get(name) ?? name)} />
      </Section>
    </>
  );
}
