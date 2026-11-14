import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Doc, Id } from "@convex/_generated/dataModel";

/** A local reactive service double for the operator dashboard: no deployment, no live writes. */

type User = Doc<"users"> & {
  company?: { companyId: Id<"companies">; name: string; role: "admin" | "member" };
};

const ACME = "company-acme" as Id<"companies">;
const LUMEN = "company-lumen" as Id<"companies">;

function user(
  index: number,
  fields: Partial<User> & Pick<User, "firstName" | "lastName" | "email" | "role">,
): User {
  return {
    _id: `user-${index}` as Id<"users">,
    _creationTime: Date.parse("2026-09-02T12:00:00Z") + index * 86_400_000,
    workosId: `workos-${index}`,
    isActive: true,
    ...fields,
  };
}

let users: User[] = [
  user(0, { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", role: "creator" }),
  user(1, { firstName: "Grace", lastName: "Hopper", email: "grace@example.com", role: "creator" }),
  user(2, {
    firstName: "Alan",
    lastName: "Turing",
    email: "alan@example.com",
    role: "creator",
    isActive: false,
  }),
  user(3, {
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan@acme.example.com",
    role: "company",
    company: { companyId: ACME, name: "Acme Robotics", role: "admin" },
  }),
  user(4, {
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@lumen.example.com",
    role: "company",
    company: { companyId: LUMEN, name: "Lumen Labs", role: "member" },
  }),
  user(5, { firstName: "Robin", lastName: "Shaw", email: "robin@ohani.com", role: "operator" }),
];

type Company = Omit<Doc<"companies">, "workosId">;

const companies: Company[] = [
  {
    _id: ACME,
    _creationTime: Date.parse("2026-08-11T12:00:00Z"),
    name: "Acme Robotics",
    isActive: true,
    industry: "Hardware",
    website: "https://acme.example.com",
    countryOfResidence: "US",
    description: "Robotics tooling for small manufacturing teams.",
  },
  {
    _id: LUMEN,
    _creationTime: Date.parse("2026-09-19T12:00:00Z"),
    name: "Lumen Labs",
    isActive: true,
    industry: "Developer tools",
  },
  {
    _id: "company-birch" as Id<"companies">,
    _creationTime: Date.parse("2026-07-01T12:00:00Z"),
    name: "Birch & Co",
    isActive: false,
    industry: "Retail",
  },
];

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
  /** Makes the next mutation or action reject, to exercise the error paths. */
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

function matchesUser(row: User, search: string) {
  return [row.firstName, row.lastName, `${row.firstName} ${row.lastName}`, row.email].some(
    (field) => field.toLowerCase().includes(search),
  );
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
  const exhausted = (results: unknown[]) => ({
    results,
    status: "Exhausted" as const,
    loadMore: () => {},
  });

  if (name === "users:list") {
    const { role, search, includeInactive } = args as {
      role?: User["role"];
      search?: string;
      includeInactive?: boolean;
    };
    const term = search?.trim().toLowerCase();
    return exhausted(
      users.filter(
        (row) =>
          (role === undefined || row.role === role) &&
          (includeInactive === true || row.isActive) &&
          (term === undefined || term === "" || matchesUser(row, term)),
      ),
    );
  }
  if (name === "companies:list") {
    const { search, isActive } = args as { search?: string; isActive?: boolean };
    const term = search?.trim().toLowerCase();
    return exhausted(
      companies.filter(
        (row) =>
          (isActive === undefined || row.isActive === isActive) &&
          (term === undefined || term === "" || row.name.toLowerCase().includes(term)),
      ),
    );
  }
  if (name === "disputes:list") {
    const { status } = args as { status: "open" | "resolved" };
    return exhausted(disputes.filter((row) => row.status === status));
  }
  throw new Error(`Unexpected paginated query ${name}`);
}

function record(name: string) {
  return async (args: Record<string, unknown>) => {
    fixture.calls.push({ name, args });
    if (fixture.fail !== null) {
      const message = fixture.fail;
      fixture.fail = null;
      throw new Error(message);
    }
    if (name === "users:setActive") {
      users = users.map((row) =>
        row._id === args.userId ? { ...row, isActive: args.isActive === true } : row,
      );
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

export function useMutation(reference: FunctionReference<"mutation">) {
  return record(getFunctionName(reference));
}

export function useAction(reference: FunctionReference<"action">) {
  return record(getFunctionName(reference));
}
