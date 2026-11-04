import { getFunctionName, type FunctionReference } from "convex/server";

/** Supplies isolated catalog responses; no calls reach a Convex deployment. */
export function useQuery(reference: FunctionReference<"query">) {
  if (new URLSearchParams(location.search).has("loading")) return undefined;
  switch (getFunctionName(reference)) {
    case "niches:list":
      return [
        {
          name: "data-analytics-business-intelligence",
          label: "Data Analytics & Business Intelligence",
        },
        { name: "databases", label: "Database Management" },
      ];
    case "skills:list":
      return [
        { name: "identity-access-management", label: "Identity & Access Management" },
        { name: "typescript", label: "TypeScript" },
      ];
    default:
      throw new Error(`Unexpected fixture query: ${getFunctionName(reference)}`);
  }
}
