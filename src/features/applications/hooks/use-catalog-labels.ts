"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

/**
 * Maps niche, skill and language names to their catalog labels. A name shows
 * as itself until the catalog loads or if it isn't in it.
 */
export function useCatalogLabels() {
  const allNiches = useQuery(api.niches.list, {});
  const allSkills = useQuery(api.skills.list, {});
  const allLanguages = useQuery(api.languages.list, {});
  const nicheLabels = new Map<string, string>(allNiches?.map((niche) => [niche.name, niche.label]));
  const skillLabels = new Map<string, string>(allSkills?.map((skill) => [skill.name, skill.label]));
  const languageLabels = new Map<string, string>(
    allLanguages?.map((language) => [language.name, language.label]),
  );
  return {
    niche: (name: string) => nicheLabels.get(name) ?? name,
    skill: (name: string) => skillLabels.get(name) ?? name,
    language: (name: string) => languageLabels.get(name) ?? name,
  };
}
