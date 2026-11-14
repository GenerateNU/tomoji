import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Id } from "@convex/_generated/dataModel";

/** A local reactive service double for the operator dashboard: no deployment, no live writes. */

type Dispute = {
  _id: Id<"disputes">;
  _creationTime: number;
  status: "open" | "resolved";
  outcome?: "approved" | "denied" | "withdrawn";
  resolvedByRole?: "creator" | "company" | "operator";
  reason: string;
  customReason?: string;
  description: string;
  companyName: string;
  openedByRole: "creator" | "company" | "operator";
  note?: string;
};

let disputes: Dispute[] = [
  {
    _id: "dispute-0" as Id<"disputes">,
    _creationTime: Date.parse("2026-10-02T12:00:00Z"),
    status: "open",
    reason: "payoutAmount",
    description: "The payout shows the base fee without the view bonus.",
    companyName: "Acme Robotics",
    openedByRole: "creator",
  },
  {
    _id: "dispute-1" as Id<"disputes">,
    _creationTime: Date.parse("2026-10-07T12:00:00Z"),
    status: "open",
    reason: "missingDisclosure",
    description: "The published post is missing the #ad tag the brief requires.",
    companyName: "Lumen Labs",
    openedByRole: "company",
  },
  {
    _id: "dispute-2" as Id<"disputes">,
    _creationTime: Date.parse("2026-09-21T12:00:00Z"),
    status: "resolved",
    outcome: "denied",
    resolvedByRole: "company",
    reason: "unfairReview",
    description: "The brief allows the deploy log the review asked me to cut.",
    companyName: "Acme Robotics",
    openedByRole: "creator",
    note: "The brief was updated before the draft was filmed.",
  },
];

let version = 0;
const listeners = new Set<() => void>();
const update = () => {
  version++;
  listeners.forEach((listener) => listener());
};

export const fixture = {
  mode: new URLSearchParams(location.search).get("scenario") ?? "ready",
  calls: [] as { name: string; args: Record<string, unknown> }[],
  /** Makes the next mutation reject, to exercise the error paths. */
  fail: null as string | null,
};

function useFixtureVersion() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
    () => version,
  );
}

export function useConvexAuth() {
  useFixtureVersion();
  return { isAuthenticated: true, isLoading: false };
}

export function useQuery(reference: FunctionReference<"query">, args: unknown) {
  useFixtureVersion();
  const name = getFunctionName(reference);
  if (args === "skip") return undefined;
  if (name === "users:me") {
    return {
      synced: true,
      userId: "user-operator" as Id<"users">,
      role: "operator",
      firstName: "Robin",
      lastName: "Shaw",
      email: "robin@ohani.com",
    };
  }
  if (name === "disputes:get") {
    const { disputeId } = args as { disputeId: string };
    return disputes.find((row) => row._id === disputeId);
  }
  throw new Error(`Unexpected query ${name}`);
}

export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  useFixtureVersion();
  const name = getFunctionName(reference);
  if (args === "skip") {
    return { results: [], status: "LoadingFirstPage", loadMore: () => {} };
  }
  if (name === "disputes:list") {
    const { status } = args as { status: "open" | "resolved" };
    return {
      results: disputes.filter((row) => row.status === status),
      status: "Exhausted" as const,
      loadMore: () => {},
    };
  }
  throw new Error(`Unexpected paginated query ${name}`);
}

export function useMutation(reference: FunctionReference<"mutation">) {
  const name = getFunctionName(reference);
  return async (args: Record<string, unknown>) => {
    fixture.calls.push({ name, args });
    if (fixture.fail !== null) {
      const message = fixture.fail;
      fixture.fail = null;
      throw new Error(message);
    }
    if (name === "disputes:resolve" || name === "disputes:override") {
      disputes = disputes.map((row) =>
        row._id === args.disputeId
          ? {
              ...row,
              status: "resolved",
              outcome: args.outcome as Dispute["outcome"],
              resolvedByRole: "operator",
              note: args.note as string | undefined,
            }
          : row,
      );
    }
    update();
    return null;
  };
}
