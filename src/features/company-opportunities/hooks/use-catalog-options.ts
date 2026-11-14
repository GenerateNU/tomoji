"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import type { SelectOption } from "@/components/select-field";

export type CatalogOptions = {
  niches: SelectOption[] | undefined;
  skills: SelectOption[] | undefined;
  languages: SelectOption[] | undefined;
};

/** The shared niche, skill, and language choices as select options; each is `undefined` while loading. */
export function useCatalogOptions(): CatalogOptions {
  const niches = useQuery(api.niches.list, {});
  const skills = useQuery(api.skills.list, {});
  const languages = useQuery(api.languages.list, {});
  return useMemo(() => {
    const toOptions = (list: { name: string; label: string }[] | undefined) =>
      list?.map(({ name, label }) => ({ value: name, label }));
    return {
      niches: toOptions(niches),
      skills: toOptions(skills),
      languages: toOptions(languages),
    };
  }, [niches, skills, languages]);
}

/** A stored name's display label, falling back to the name while the catalog loads. */
export function labelOf(options: SelectOption[] | undefined, name: string): string {
  return options?.find((option) => option.value === name)?.label ?? name;
}
