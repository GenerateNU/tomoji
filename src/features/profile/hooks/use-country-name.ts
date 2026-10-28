import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * The display name for a stored alpha-2 code. Read from the same list the
 * picker uses so a chosen country reads back identically, falling back to the
 * code while the list loads or if it is not an assigned one. Creators with no
 * country set never request the list.
 */
export function useCountryName(code?: string): string | undefined {
  const countries = useQuery(api.countries.list, code === undefined ? "skip" : {});
  if (code === undefined) return undefined;
  return countries?.find((entry) => entry.code === code)?.name ?? code;
}
