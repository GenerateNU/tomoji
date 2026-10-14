import { expect, test } from "vitest";
import { email, parseForm, required } from "./form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const rules = {
  firstName: [required("First name required")],
  email: [required("Email required"), email()],
  password: [required("Password required")],
};

test("valid input returns trimmed data", () => {
  const result = parseForm(
    formData({ firstName: "  Zahra ", email: " zahra@example.com ", password: "correct horse" }),
    rules,
  );
  expect(result).toEqual({
    ok: true,
    data: { firstName: "Zahra", email: "zahra@example.com", password: "correct horse" },
  });
});

test("each field reports its first failing rule", () => {
  const result = parseForm(formData({ firstName: "", email: "not-an-email", password: "" }), rules);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.state.fieldErrors).toEqual({
    firstName: "First name required",
    email: "Enter a valid email address.",
    password: "Password required",
  });
});

test("missing fields count as empty", () => {
  const result = parseForm(formData({}), rules);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(Object.keys(result.state.fieldErrors)).toEqual(["firstName", "email", "password"]);
});

test("a failed parse echoes what was typed, except passwords", () => {
  const result = parseForm(formData({ firstName: "Zahra", email: "zahra@", password: "" }), rules);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.state.values).toEqual({ firstName: "Zahra", email: "zahra@" });
  expect(result.state.fieldErrors).toEqual({
    email: "Enter a valid email address.",
    password: "Password required",
  });
});

test("passwords are not trimmed", () => {
  const result = parseForm(
    formData({ firstName: "Z", email: "z@example.com", password: " spaced out " }),
    rules,
  );
  expect(result.ok && result.data.password).toBe(" spaced out ");
});

test("emails follow the browser's email format and need a dot in the domain", () => {
  const check = (value: string) =>
    parseForm(formData({ firstName: "Z", email: value, password: "pw" }), rules);
  for (const bad of [
    "AHI;WFHA;WEIHFUA@gmail.com",
    "two@@example.com",
    "spaced out@example.com",
    "no-dot@localhost",
    "trailing@example.",
  ]) {
    expect(check(bad).ok, bad).toBe(false);
  }
  for (const good of [
    "zahra@example.com",
    "zahra.w+tomoji@mail.example.co.uk",
    "o'neil@example.com",
  ]) {
    expect(check(good).ok, good).toBe(true);
  }
});

test("a likely typo in the email domain suggests the fix", () => {
  const result = parseForm(
    formData({ firstName: "Z", email: "gulnasmosh@gmail.con", password: "pw" }),
    rules,
  );
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.state.fieldErrors.email).toBe("Did you mean gulnasmosh@gmail.com?");
});
