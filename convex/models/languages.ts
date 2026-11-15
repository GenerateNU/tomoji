import { apiError } from "../lib/errors";
import {
  catalogOption,
  listCatalogOptions,
  requireCatalogOption,
  type CatalogOption,
} from "./catalog";

/** Spoken languages a brief can ask for, in display order. */
export const LANGUAGES = [
  { name: "english", label: "English" },
  { name: "spanish", label: "Spanish" },
  { name: "portuguese", label: "Portuguese" },
  { name: "german", label: "German" },
  { name: "french", label: "French" },
  { name: "japanese", label: "Japanese" },
  { name: "chinese-simplified", label: "Chinese (simplified)" },
  { name: "korean", label: "Korean" },
  { name: "russian", label: "Russian" },
  { name: "italian", label: "Italian" },
  { name: "polish", label: "Polish" },
  { name: "turkish", label: "Turkish" },
  { name: "indonesian", label: "Indonesian" },
  { name: "vietnamese", label: "Vietnamese" },
  { name: "ukrainian", label: "Ukrainian" },
  { name: "dutch", label: "Dutch" },
  { name: "hindi", label: "Hindi" },
  { name: "arabic", label: "Arabic" },
  { name: "hebrew", label: "Hebrew" },
] as const;

export const language = catalogOption;
export type Language = CatalogOption;

/** Most languages one brief can ask for, so the requirement stays meaningful. */
export const MAX_LANGUAGES = 5;

/** Lists the predefined language options, optionally matching a name or display label. */
export function listLanguages(search?: string): Language[] {
  return listCatalogOptions(LANGUAGES, search);
}

/**
 * Returns the stored name for a language, matching loosely on case and spacing.
 *
 * @throws `invalid_state` with `invalid_language` if it isn't on the list.
 */
export function requireLanguage(input: string): string {
  return requireCatalogOption(LANGUAGES, input, "language");
}

/**
 * Returns the stored names with repeats removed, keeping their order.
 *
 * @throws `invalid_state` with `invalid_language` for a name not on the list,
 * or `too_many_languages` for more than `MAX_LANGUAGES`.
 */
export function requireLanguages(names: string[]): string[] {
  const unique = [...new Set(names.map(requireLanguage))];
  if (unique.length > MAX_LANGUAGES) {
    throw apiError("invalid_state", { reason: "too_many_languages", max: MAX_LANGUAGES });
  }
  return unique;
}
