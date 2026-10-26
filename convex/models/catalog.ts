import { v, type Infer } from "convex/values";
import { apiError } from "../lib/errors";

export const catalogOption = v.object({ name: v.string(), label: v.string() });
export type CatalogOption = Infer<typeof catalogOption>;

/** Normalizes names without stripping meaningful skill punctuation. */
function normalizeCatalogName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/** Searches a fixed catalog by name or display label, preserving display order. */
export function listCatalogOptions(
  catalog: readonly CatalogOption[],
  search = "",
): CatalogOption[] {
  const term = normalizeCatalogName(search);
  return catalog.filter(
    (option) =>
      normalizeCatalogName(option.name).includes(term) ||
      normalizeCatalogName(option.label).includes(term),
  );
}

/** Resolves a catalog name or label to its stable stored name; unknown values are rejected. */
export function requireCatalogOption(
  catalog: readonly CatalogOption[],
  input: string,
  kind: "niche" | "skill",
): string {
  const name = normalizeCatalogName(input);
  const option = catalog.find(
    (entry) => entry.name === name || normalizeCatalogName(entry.label) === name,
  );
  if (option === undefined) {
    throw apiError("invalid_state", { reason: `invalid_${kind}`, [kind]: input });
  }
  return option.name;
}
