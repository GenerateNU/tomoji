import { suggestEmail } from "./email-typos";

/**
 * What an auth server action hands back to its form. `values` lets the form
 * keep what the user typed after a failed submit; passwords are never echoed.
 * `redirectTo` is set once the user is signed in.
 */
export type FormState<Field extends string> = {
  values: Partial<Record<Field, string>>;
  fieldErrors: Partial<Record<Field, string>>;
  formError: string | null;
  redirectTo?: string;
};

/** A check returns an error message, or null when the value passes. */
export type Rule = (value: string) => string | null;

export type Rules<Field extends string> = Record<Field, Rule[]>;

type ParseResult<Field extends string> =
  | { ok: true; data: Record<Field, string> }
  | { ok: false; state: FormState<Field> };

const SECRET_FIELDS: ReadonlySet<string> = new Set(["password"]);

export function emptyFormState<Field extends string>(): FormState<Field> {
  return { values: {}, fieldErrors: {}, formError: null };
}

export function required(message: string): Rule {
  return (value) => (value === "" ? message : null);
}

// The format browsers use for <input type="email"> (WHATWG HTML spec), so
// we accept exactly what WorkOS does.
const EMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function email(): Rule {
  return (value) => {
    // The spec allows a dot-less domain like `localhost`; real addresses need one.
    if (!EMAIL_FORMAT.test(value) || !value.split("@")[1].includes(".")) {
      return "Enter a valid email address.";
    }
    const suggestion = suggestEmail(value);
    return suggestion ? `Did you mean ${suggestion}?` : null;
  };
}

/** The first failing rule's message for one field, or null. Used while the user types. */
export function validateField(field: string, value: string, rules: Rule[]): string | null {
  const normalized = SECRET_FIELDS.has(field) ? value : value.trim();
  for (const rule of rules) {
    const error = rule(normalized);
    if (error !== null) return error;
  }
  return null;
}

/** Reads the fields named in `rules` and reports the first failing rule per field. */
export function parseForm<Field extends string>(
  formData: FormData,
  rules: Rules<Field>,
): ParseResult<Field> {
  const fields = Object.keys(rules) as Field[];
  const data = {} as Record<Field, string>;
  const fieldErrors: Partial<Record<Field, string>> = {};

  for (const field of fields) {
    const raw = formData.get(field);
    const text = typeof raw === "string" ? raw : "";
    // Leading or trailing spaces can be part of a password.
    const value = SECRET_FIELDS.has(field) ? text : text.trim();
    data[field] = value;
    const error = validateField(field, value, rules[field]);
    if (error !== null) fieldErrors[field] = error;
  }

  if (Object.keys(fieldErrors).length === 0) return { ok: true, data };
  return { ok: false, state: { values: echoable(data), fieldErrors, formError: null } };
}

/** The submitted values that are safe to send back to the browser. */
export function echoable<Field extends string>(
  data: Partial<Record<Field, string>>,
): Partial<Record<Field, string>> {
  return Object.fromEntries(
    Object.entries(data).filter(([field]) => !SECRET_FIELDS.has(field)),
  ) as Partial<Record<Field, string>>;
}
