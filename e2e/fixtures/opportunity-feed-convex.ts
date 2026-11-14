import { getFunctionName, type FunctionReference } from "convex/server";

/** Feed items shaped like `opportunities.discover`; no calls reach a Convex deployment. */
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 1);

function brief(
  index: number,
  fields: {
    title: string;
    companyName: string;
    isGated: boolean;
    maxSlots?: number;
    numFilledSlots?: number;
    fixedFeeCents: number;
    cpmRateCents: number;
    application?: "pending";
    assignment?: "termsPending";
    isStarred?: boolean;
    niches?: string[];
    skills?: string[];
    minFollowerRange?: string;
  },
) {
  return {
    _id: `opportunity${index}`,
    _creationTime: now - (index + 1) * 3 * DAY,
    description:
      "Plan, write and review code with an AI pair programmer. Create short, original videos showing practical workflows.",
    usesAiReviewDefault: true,
    maxSlots: fields.maxSlots ?? 10,
    numFilledSlots: fields.numFilledSlots ?? 0,
    deadline: now + (index + 2) * 7 * DAY,
    status: "open",
    paymentCapCents: 450_000,
    contentRequirements: "Create 3 original videos per week, for 2 paid weeks, on X.",
    reviewPolicy: "Disclose the paid partnership. No medical claims.",
    niches: fields.niches ?? ["generative-ai-llms"],
    skills: fields.skills ?? ["python"],
    languages: ["english"],
    isStarred: fields.isStarred ?? false,
    application: fields.application
      ? { _id: `application${index}`, status: fields.application }
      : null,
    assignment: fields.assignment ? { _id: `assignment${index}`, status: fields.assignment } : null,
    ...fields,
  };
}

const FEED = [
  brief(0, {
    title: "Claude Opus 5.5",
    companyName: "Anthropic",
    isGated: true,
    fixedFeeCents: 30_000,
    cpmRateCents: 250,
    application: "pending",
    isStarred: true,
  }),
  brief(1, {
    title: "GPT-4 Turbo",
    companyName: "OpenAI",
    isGated: false,
    maxSlots: 20,
    numFilledSlots: 8,
    fixedFeeCents: 40_000,
    cpmRateCents: 300,
    assignment: "termsPending",
  }),
  brief(2, {
    title: "Bard AI",
    companyName: "Google",
    isGated: false,
    numFilledSlots: 7,
    fixedFeeCents: 50_000,
    cpmRateCents: 400,
  }),
  brief(3, {
    title: "v0 by Vercel",
    companyName: "Vercel",
    isGated: false,
    maxSlots: 15,
    numFilledSlots: 15,
    fixedFeeCents: 35_000,
    cpmRateCents: 275,
  }),
  brief(4, {
    title: "Copilot Workspace",
    companyName: "GitHub",
    isGated: true,
    fixedFeeCents: 45_000,
    cpmRateCents: 325,
    minFollowerRange: "50k-100k",
  }),
  brief(5, {
    title: "Figma Make with a much longer title than fits",
    companyName: "Figma",
    isGated: false,
    maxSlots: 5,
    numFilledSlots: 3,
    fixedFeeCents: 40_000,
    cpmRateCents: 300,
  }),
];

function params() {
  return new URLSearchParams(location.search);
}

export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  if (args === "skip") return { results: [], status: "LoadingFirstPage", loadMore() {} };
  if (params().has("loading")) return { results: [], status: "LoadingFirstPage", loadMore() {} };
  if (params().has("empty")) return { results: [], status: "Exhausted", loadMore() {} };
  // A search or filter that matches nothing.
  const filters = args as { search?: string; niches?: string[] };
  if (filters.search || filters.niches) return { results: [], status: "Exhausted", loadMore() {} };
  const name = getFunctionName(reference);
  const results = name === "opportunities:listStarred" ? FEED.filter((o) => o.isStarred) : FEED;
  return { results, status: "Exhausted", loadMore() {} };
}

export function useQuery(reference: FunctionReference<"query">) {
  switch (getFunctionName(reference)) {
    case "niches:list":
      return [
        { name: "generative-ai-llms", label: "Generative AI & LLMs" },
        { name: "developer-tools-productivity", label: "Developer Tools & Productivity" },
      ];
    case "skills:list":
      return [
        { name: "python", label: "Python" },
        { name: "typescript", label: "TypeScript" },
      ];
    case "languages:list":
      return [{ name: "english", label: "English" }];
    default:
      return undefined;
  }
}

export function useMutation() {
  return async () => null;
}

export function useAction() {
  // Company media never loads here, so cards show the banner placeholder.
  return () => new Promise(() => {});
}
