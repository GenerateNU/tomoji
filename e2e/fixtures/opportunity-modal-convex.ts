import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { useSyncExternalStore } from "react";

/**
 * An in-memory stand-in for the company opportunity modal's backend; no
 * deployment involved. Mutations change the rows and re-render subscribers.
 * Query flags: ?loading, ?empty, ?locked (a creator has joined), ?ai (AI
 * review on), ?closed, ?missing (the opportunity read fails), ?fail (writes fail).
 */
const DAY = 86_400_000;
const now = Date.now();
const flags = new URLSearchParams(location.search);

type Criterion = { id: string; description: string };
type Deliverable = {
  _id: string;
  _creationTime: number;
  opportunityId: string;
  createdBy: string;
  title: string;
  description: string;
  reviewCriteria?: Criterion[];
};

const OPPORTUNITY = {
  _id: "opportunity1",
  _creationTime: now - 20 * DAY,
  campaignId: "campaign1",
  companyId: "company1",
  createdBy: "member1",
  title: "Anthropic Opus 5.5 – Web Dev",
  description:
    "Join our Web Development opportunity to showcase how Claude Opus 5.5 can streamline building modern web applications. We're looking for developers and tech creators to build a functional web app using Claude, then share the process with their audience on X.",
  isGated: false,
  usesAiReviewDefault: flags.has("ai"),
  maxSlots: 10,
  numFilledSlots: flags.has("locked") ? 1 : 0,
  deadline: now + 30 * DAY,
  status: flags.has("closed") ? "closed" : "open",
  fixedFeeCents: 50_000,
  cpmRateCents: 1_500,
  paymentCapCents: 300_000,
  contentRequirements: "One original X post.",
  reviewPolicy: "Must show the finished app.",
  niches: ["tech"],
  skills: ["coding"],
  languages: ["english"],
};

const CAMPAIGN = {
  _id: "campaign1",
  _creationTime: now - 40 * DAY,
  companyId: "company1",
  createdBy: "member1",
  title: "Opus 5.5",
  description: "A creator campaign showcasing Claude Opus 5.5.",
  status: "open",
  budgetCents: 2_500_000,
  startsAt: now - 28 * DAY,
};

let deliverables: Deliverable[] = flags.has("empty")
  ? []
  : [
      {
        _id: "deliverable1",
        _creationTime: now - 10 * DAY,
        opportunityId: "opportunity1",
        createdBy: "member1",
        title: "Web Dev Tutorial",
        description:
          "Create an engaging post on X demonstrating your development workflow, from describing your application idea to generating, refining, and implementing code with Claude.\nContent Requirements:\n- Build a functional web application using Claude Opus 5.5.\n- Demonstrate how Claude assists with code generation, debugging, and feature implementation.\n- Share a short screen recording or demo of the completed application.",
        reviewCriteria: [
          { id: "post", description: "One original X post featuring the application." },
          { id: "demo", description: "A screen recording or demo showcasing the final product." },
          { id: "link", description: "A link to the GitHub repository or deployed application." },
        ],
      },
      {
        _id: "deliverable2",
        _creationTime: now - 8 * DAY,
        opportunityId: "opportunity1",
        createdBy: "member1",
        title: "Web Dev UX",
        description: "Walk through the UI you built with Claude and explain one design decision.",
      },
    ];

let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version += 1;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function fail(reason: string): never {
  throw new ConvexError({ code: "invalid_state", reason });
}

function read(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "users:me":
      return { synced: true, role: "company", companyRole: "admin", _id: "user1" };
    case "opportunities:get":
      if (flags.has("missing")) throw new ConvexError({ code: "not_found" });
      return OPPORTUNITY;
    case "campaigns:get":
      return CAMPAIGN;
    case "deliverables:list":
      return deliverables;
    case "assignments:list":
      return {
        page: flags.has("locked") ? [{ _id: "assignment1" }] : [],
        isDone: true,
        continueCursor: "",
      };
    default:
      void args;
      return undefined;
  }
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: true };
}

export function useQuery(reference: FunctionReference<"query">, args?: unknown) {
  useSyncExternalStore(subscribe, () => version);
  if (args === "skip" || flags.has("loading")) return undefined;
  return read(getFunctionName(reference), (args ?? {}) as Record<string, unknown>);
}

export function usePaginatedQuery() {
  return { results: [], status: "Exhausted", loadMore() {} };
}

export function useMutation(reference: FunctionReference<"mutation">) {
  const name = getFunctionName(reference);
  return async (args: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (flags.has("fail")) fail("opportunity_has_assignments");
    switch (name) {
      case "deliverables:create": {
        const { opportunityId, ...fields } = args as { opportunityId: string } & Deliverable;
        const _id = `deliverable${Date.now()}`;
        deliverables = [
          ...deliverables,
          {
            ...fields,
            _id,
            _creationTime: Date.now(),
            opportunityId,
            createdBy: "member1",
          },
        ];
        changed();
        return _id;
      }
      case "deliverables:update": {
        const { deliverableId, ...fields } = args as { deliverableId: string };
        deliverables = deliverables.map((row) =>
          row._id === deliverableId ? { ...row, ...fields } : row,
        );
        changed();
        return deliverables.find((row) => row._id === deliverableId);
      }
      case "deliverables:remove":
        deliverables = deliverables.filter((row) => row._id !== args.deliverableId);
        changed();
        return null;
      default:
        return null;
    }
  };
}

export function useAction() {
  return () => new Promise(() => {});
}
