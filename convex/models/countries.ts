import countries from "i18n-iso-countries";
import english from "i18n-iso-countries/langs/en.json";
import { v, type Infer } from "convex/values";
import { apiError } from "../lib/errors";

countries.registerLocale(english);

export const country = v.object({ code: v.string(), name: v.string() });
export type Country = Infer<typeof country>;

/** Every ISO 3166-1 alpha-2 country, for the residence picker. */
export const COUNTRIES: readonly Country[] = Object.entries(
  countries.getNames("en", { select: "official" }),
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Returns the stored alpha-2 code. Input is matched loosely on case, so "us"
 * and "US" both mean `US`.
 *
 * @throws `invalid_state` with `invalid_country` if it is not an assigned code.
 */
export function requireCountry(input: string): string {
  const code = input.trim().toUpperCase();
  if (!countries.isValid(code)) {
    throw apiError("invalid_state", { reason: "invalid_country" });
  }
  return code;
}
