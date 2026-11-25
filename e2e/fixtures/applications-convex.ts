import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { applicationTab } from "@/features/applications/lib/application-status";

/**
 * The creator's applications, shaped like `applications.searchMine` and
 * `applications.getMineDetail`; no calls reach a Convex deployment.
 */
const now = Date.now();
const HOUR = 3_600_000;

const opportunity = (title: string, companyName: string) => ({
  _id: `opportunity-${title}`,
  _creationTime: now - 240 * HOUR,
  title,
  description: "Create short, original videos showing practical workflows.",
  isGated: true,
  usesAiReviewDefault: true,
  maxSlots: 10,
  numFilledSlots: 2,
  deadline: now + 240 * HOUR,
  status: "open",
  fixedFeeCents: 30_000,
  cpmRateCents: 250,
  paymentCapCents: 450_000,
  contentRequirements: "Create 3 original videos per week, for 2 paid weeks, on X.",
  companyName,
  niches: [],
  skills: [],
  languages: ["english"],
});

const APPLICATIONS = [
  {
    id: "application-pending",
    status: "pending",
    title: "Owala Pastels",
    companyName: "Owala",
  },
  {
    id: "application-offer",
    status: "offered",
    title: "Claude Opus 5.5",
    companyName: "Anthropic",
  },
  {
    id: "application-accepted",
    status: "accepted",
    title: "Jamba Juice",
    companyName: "Jamba",
  },
] as const;

const count = (tab: string) => ({
  count: APPLICATIONS.filter((a) => applicationTab(a.status) === tab).length,
  isCapped: false,
});

function row(application: (typeof APPLICATIONS)[number]) {
  return {
    applicationId: application.id,
    opportunityId: `opportunity-${application.title}`,
    status: application.status,
    submittedAt: now - 72 * HOUR,
    offerExpiresAt: application.status === "offered" ? now + 30 * HOUR : undefined,
    offerAcceptedAt: application.status === "accepted" ? now - 24 * HOUR : undefined,
    title: application.title,
    companyName: application.companyName,
    fixedFeeCents: 30_000,
    cpmRateCents: 250,
    paymentCapCents: 450_000,
    isStarred: false,
    canStar: true,
  };
}

// Convex returns the same object until the data changes; `useStableQuery` relies on it.
const searchResults = new Map<string, unknown>();
function searchMine(tab: "applications" | "offers" | "accepted") {
  if (!searchResults.has(tab)) {
    const rows = APPLICATIONS.filter((a) => applicationTab(a.status) === tab).map(row);
    searchResults.set(tab, {
      tab,
      rows,
      page: 1,
      pageSize: 10,
      totalCount: rows.length,
      pageCount: 1,
      counts: {
        applications: count("applications"),
        offers: count("offers"),
        accepted: count("accepted"),
      },
    });
  }
  return searchResults.get(tab);
}

const details = new Map<string, unknown>();
function getMineDetail(applicationId: string) {
  const application = APPLICATIONS.find((a) => a.id === applicationId);
  // Like the server: a missing application, or another creator's, reads as not found.
  if (!application) throw new ConvexError({ code: "not_found", reason: "application" });
  if (!details.has(applicationId)) {
    const offered = application.status === "offered";
    details.set(applicationId, {
      applicationId,
      status: application.status,
      submittedAt: now - 72 * HOUR,
      offerExpiresAt: offered ? now + 30 * HOUR : undefined,
      offerAcceptedAt: application.status === "accepted" ? now - 24 * HOUR : undefined,
      opportunity: opportunity(application.title, application.companyName),
      canAccept: offered,
      canDecline: offered,
      termsRequired: false,
    });
  }
  return details.get(applicationId);
}

export function useQuery(reference: FunctionReference<"query">, args?: unknown) {
  if (args === "skip") return undefined;
  switch (getFunctionName(reference)) {
    case "applications:searchMine":
      return searchMine((args as { tab: "applications" | "offers" | "accepted" }).tab);
    case "applications:getMineDetail":
      return getMineDetail((args as { applicationId: string }).applicationId);
    case "niches:list":
    case "skills:list":
    case "languages:list":
      return [];
    default:
      return undefined;
  }
}

export { useMutation } from "./mutation-double";

export function useAction() {
  // Company logos never load here, so avatars show initials.
  return () => new Promise(() => {});
}
