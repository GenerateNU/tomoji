import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";

/**
 * Company-side responses for previewing a campaign's opportunity screens; no
 * deployment involved. Query flags: `loading`, `empty`, `missing` (unknown
 * campaign), `fail=<reason>` (mutations reject with that `invalid_state` reason).
 */
const DAY = 86_400_000;
const HALF_HOUR = 1_800_000;
const now = Date.now();
const deadline = (days: number) => Math.round((now + days * DAY) / HALF_HOUR) * HALF_HOUR;

export const CAMPAIGN = {
  _id: "campaign1",
  _creationTime: now - 40 * DAY,
  companyId: "company1",
  createdBy: "member1",
  title: "Opus 5.5",
  description: "A creator campaign showcasing Claude Opus 5.5 for complex reasoning and coding.",
  status: "open",
  budgetCents: 2_500_000,
  startsAt: now - 28 * DAY,
  endsAt: deadline(60),
};

const brief = {
  campaignId: "campaign1",
  companyId: "company1",
  createdBy: "member1",
  isGated: true,
  usesAiReviewDefault: false,
  numFilledSlots: 3,
  fixedFeeCents: 30_000,
  cpmRateCents: 300,
  paymentCapCents: 200_000,
  contentRequirements:
    "Create an original X post or thread showcasing a web app built with Claude Opus 5.5.\nTag @claudeai and disclose sponsored content.",
  reviewPolicy: "All submissions are reviewed within 3 business days.",
  minFollowerRange: "10k-50k",
  niches: ["technology"],
  skills: ["web-development"],
  languages: ["en"],
};

export const OPPORTUNITIES = [
  {
    ...brief,
    _id: "opportunity1",
    _creationTime: now - 28 * DAY,
    title: "Opus 5.5 - Web Dev",
    description: "Build a functional web app using Claude and share the process on X.",
    status: "open",
    maxSlots: 10,
    deadline: deadline(20),
  },
  {
    ...brief,
    _id: "opportunity2",
    _creationTime: now - 26 * DAY,
    title: "Opus 5.5 - Prompt Engineer",
    description: "Show how you prompt Claude for hard reasoning tasks.",
    status: "open",
    maxSlots: 20,
    deadline: deadline(30),
  },
  {
    ...brief,
    _id: "opportunity3",
    _creationTime: now - 14 * DAY,
    title: "Opus 5.5 - Data Science",
    description: "Analyze a public dataset with Claude.",
    status: "paused",
    maxSlots: 5,
    deadline: deadline(10),
  },
  {
    ...brief,
    _id: "opportunity4",
    _creationTime: now - 2 * DAY,
    title: "Opus 5.5 - Mobile",
    description: "Ship a small mobile app with Claude.",
    status: "draft",
    numFilledSlots: 0,
    maxSlots: 8,
    deadline: deadline(40),
  },
  {
    ...brief,
    _id: "opportunity5",
    _creationTime: now - 50 * DAY,
    title: "Opus 5.5 - Launch Week",
    description: "Launch-week reactions.",
    status: "closed",
    maxSlots: 10,
    deadline: deadline(-5),
  },
];

const CATALOG = {
  "niches:list": [
    { name: "technology", label: "Technology" },
    { name: "software-development", label: "Software Development" },
    { name: "education", label: "Education" },
  ],
  "skills:list": [
    { name: "web-development", label: "Web Development" },
    { name: "video-editing", label: "Video Editing" },
    { name: "copywriting", label: "Copywriting" },
  ],
  "languages:list": [
    { name: "en", label: "English" },
    { name: "es", label: "Spanish" },
    { name: "hi", label: "Hindi" },
  ],
};

function params() {
  return new URLSearchParams(location.search);
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: true };
}

export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  if (args === "skip" || params().has("loading")) {
    return { results: [], status: "LoadingFirstPage", loadMore() {} };
  }
  if (getFunctionName(reference) === "opportunities:list") {
    const status = (args as { status?: string }).status;
    return {
      results: params().has("empty") ? [] : OPPORTUNITIES.filter((o) => o.status === status),
      status: "Exhausted",
      loadMore() {},
    };
  }
  return { results: [], status: "Exhausted", loadMore() {} };
}

export function useQuery(reference: FunctionReference<"query">, args?: unknown) {
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  switch (name) {
    case "users:me":
      return { synced: true, role: "company", companyRole: "admin", _id: "user1" };
    case "campaigns:get":
      if (params().has("missing")) {
        throw new ConvexError({ code: "not_found", reason: "campaign" });
      }
      return params().has("loading") ? undefined : CAMPAIGN;
    case "opportunities:get":
      return OPPORTUNITIES.find((o) => o._id === (args as { opportunityId: string }).opportunityId);
    default:
      return name in CATALOG ? CATALOG[name as keyof typeof CATALOG] : undefined;
  }
}

export function useMutation(reference: FunctionReference<"mutation">) {
  return async (args: unknown) => {
    console.info("mutation", getFunctionName(reference), args);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const fail = params().get("fail");
    if (fail) throw new ConvexError({ code: "invalid_state", reason: fail });
    return "opportunity-new";
  };
}

export function useAction() {
  return () => new Promise(() => {});
}
