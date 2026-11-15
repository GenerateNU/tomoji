"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * What the creator has typed so far, shared between the form on the left and
 * the preview on the right so the profile fills in as they type.
 *
 * Each step still saves to Convex on Continue, so leaving halfway keeps what
 * was entered. This only exists because the preview has to update on every
 * keystroke, which a round trip per character would not.
 */
export type OnboardingDraft = {
  birthdate: string;
  countryOfResidence: string;
  languages: string[];
  niches: string[];
  skills: string[];
  githubLink: string;
  linkedinLink: string;
  additionalLinks: string[];
};

const EMPTY: OnboardingDraft = {
  birthdate: "",
  countryOfResidence: "",
  languages: [],
  niches: [],
  skills: [],
  githubLink: "",
  linkedinLink: "",
  additionalLinks: [],
};

type DraftContext = {
  draft: OnboardingDraft;
  setDraft: (changes: Partial<OnboardingDraft>) => void;
};

const Context = createContext<DraftContext | null>(null);

export function OnboardingDraftProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<OnboardingDraft>;
}) {
  const [draft, setState] = useState<OnboardingDraft>({ ...EMPTY, ...initial });
  const value = useMemo<DraftContext>(
    () => ({
      draft,
      setDraft: (changes) => setState((current) => ({ ...current, ...changes })),
    }),
    [draft],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOnboardingDraft(): DraftContext {
  const context = useContext(Context);
  if (context === null) {
    throw new Error("useOnboardingDraft must be used inside OnboardingDraftProvider");
  }
  return context;
}
