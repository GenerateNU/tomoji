import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Call = { name: string; args: Record<string, unknown> };
type Profile = FunctionReturnType<typeof api.creators.me>;

const listeners = new Set<() => void>();
let revision = 0;

/** A creator part-way through onboarding: synced, but nothing filled in yet. */
let profile: Profile = {
  creatorId: "test-creator" as Id<"creators">,
  joinedAt: Date.UTC(2026, 10, 15),
  firstName: "Zahra",
  lastName: "Wibisana",
  email: "zahra@example.test",
  additionalLinks: [],
  niches: [],
  skills: [],
  languages: [],
};

const COUNTRIES = [
  { code: "ID", name: "Indonesia" },
  { code: "ES", name: "Spain" },
  { code: "US", name: "United States" },
];
const NICHES = [
  { name: "backend-development", label: "Backend Development" },
  { name: "generative-ai", label: "Generative AI & LLMs" },
  { name: "design", label: "UI / UX Design" },
  { name: "product-management", label: "Product Management" },
];
const SKILLS = [
  { name: "typescript", label: "TypeScript" },
  { name: "python", label: "Python" },
  { name: "ruby", label: "Ruby" },
];
const LANGUAGES = [
  { name: "english", label: "English" },
  { name: "spanish", label: "Spanish" },
  { name: "japanese", label: "Japanese" },
];

const calls: Call[] = [];
const failures = new Map<string, Error[]>();
const parameters = new URLSearchParams(location.search);
let session = {
  isAuthenticated: true,
  isLoading: false,
  xConnected: parameters.has("xConnected"),
};

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

export const fixture = {
  calls,
  setProfile(changes: Partial<Profile>) {
    profile = { ...profile, ...changes } as Profile;
    notify();
  },
  setSession(updates: Partial<typeof session>) {
    session = { ...session, ...updates };
    notify();
  },
  failNext(name: string, error = new Error("Simulated failure")) {
    failures.set(name, [...(failures.get(name) ?? []), error]);
  },
};

function useRevision() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
    () => revision,
  );
}

export function useConvexAuth() {
  useRevision();
  return { isAuthenticated: session.isAuthenticated, isLoading: session.isLoading };
}

export function useQuery(reference: FunctionReference<"query">, args: unknown) {
  useRevision();
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name === "users:me") {
    return {
      synced: true,
      role: "creator",
      userId: "test-user",
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
    };
  }
  if (name === "creators:me") return profile;
  if (name === "xAccounts:me") {
    return session.xConnected ? { xUserId: "123", username: "zahra" } : null;
  }
  if (name === "countries:list") return COUNTRIES;
  if (name === "niches:list") return NICHES;
  if (name === "skills:list") return SKILLS;
  if (name === "languages:list") return LANGUAGES;
  throw new Error(`Unexpected query: ${name}`);
}

const operations = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

function operation(reference: FunctionReference<"mutation" | "action">) {
  const name = getFunctionName(reference);
  if (!operations.has(name)) {
    operations.set(name, async (args) => {
      calls.push({ name, args });
      const failure = failures.get(name)?.shift();
      if (failure) throw failure;
      if (name === "creators:update") {
        profile = { ...profile, ...args } as Profile;
        notify();
        return profile;
      }
      if (name === "creators:completeOnboarding") {
        profile = { ...profile, onboardingCompletedAt: Date.now() };
        notify();
        return profile;
      }
      if (name === "xAccounts:start") {
        return { authorizationUrl: "https://x.example.test/authorize", expiresAt: Date.now() };
      }
      throw new Error(`Unexpected operation: ${name}`);
    });
  }
  return operations.get(name)!;
}

export const useMutation = operation;
export const useAction = operation;
