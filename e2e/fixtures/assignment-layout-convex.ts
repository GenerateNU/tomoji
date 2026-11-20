import { getFunctionName, type FunctionReference } from "convex/server";
import * as session from "./settings-convex";

export const { useConvexAuth, useQueries, useConvex, useAction, useMutation } = session;
const now = Date.now();
const day = 86400000;
const title =
  "Design workflow walkthrough with a deliberately long title that should wrap within the submission card";
const rounds = [
  {
    _id: "submission0",
    _creationTime: now - day,
    status: "pending",
    draftDescription: "Revised draft: show the result first.",
    caption: "Building a prototype. #ad",
  },
  {
    _id: "submission1",
    _creationTime: now - 2 * day,
    status: "approved",
    draftDescription: "A previous approved draft.",
    reviewNote: "Approved with the requested changes.",
    caption: "A finished prototype. #ad",
  },
  {
    _id: "submission2",
    _creationTime: now - 3 * day,
    status: "changesRequested",
    draftDescription: "An initial draft with a longer description. ".repeat(10),
    reviewNote: "Show the final result first. " + "longnote".repeat(40),
    caption: "First prototype.",
  },
];
function current() {
  const state = new URLSearchParams(location.search).get("state") ?? "pending";
  return rounds.find((r) => r.status === state) ?? rounds[0];
}
const assignments = rounds.map((r, i) => ({
  _id: `assignment${i}`,
  _creationTime: r._creationTime,
  status: "active",
  title,
  companyName: "Northstar Studio",
  opportunityTitle: "Design workflow campaign",
  next: { id: `deliverable${i}`, status: r.status },
}));
export function useQuery(reference: FunctionReference<"query">, args?: unknown) {
  if (args === "skip") return undefined;
  switch (getFunctionName(reference)) {
    case "assignments:listMineFilterOptions":
      return {
        counts: { notStarted: 0, review: 1, approved: 1, changesNeeded: 1 },
        opportunities: [{ id: "opportunity0", label: "Design workflow campaign" }],
      };
    case "assignments:getMineDetails":
      return {
        assignment: {
          _id: "assignment0",
          _creationTime: now - 7 * day,
          status: "active",
          opportunityId: "opportunity0",
          usesAiReview: false,
        },
        companyName: "Northstar Studio",
        title: "Design workflow campaign",
        brief: {
          description:
            "Show how you move from a brief to a finished prototype. Include a clear demonstration.",
        },
        deliverables: [
          {
            _id: "deliverable0",
            title,
            latest: { _id: current()._id, status: current().status },
            exampleMediaIds: [],
          },
        ],
      };
    case "posts:list":
      return { page: [], isDone: true, continueCursor: "" };
    case "submissions:get":
      return rounds.find((r) => r._id === (args as { submissionId: string }).submissionId);
    default:
      return session.useQuery(reference, args);
  }
}
export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  switch (getFunctionName(reference)) {
    case "assignments:listMineSummaries": {
      const queue = (args as { queue: string }).queue;
      const status =
        queue === "review" ? "pending" : queue === "approved" ? "approved" : "changesRequested";
      return {
        results: assignments.filter((a) => a.next.status === status),
        status: "Exhausted",
        loadMore() {},
      };
    }
    case "submissions:list":
      return { results: rounds, status: "Exhausted", loadMore() {} };
    default:
      return session.usePaginatedQuery(reference, args);
  }
}
