import { expect, test } from "vitest";
import { suggestEmail } from "@/features/auth/lib/email-typos";

test("a mistyped .com ending is corrected", () => {
  expect(suggestEmail("gulnasmosh@gmail.con")).toBe("gulnasmosh@gmail.com");
  expect(suggestEmail("zahra@studio.cmo")).toBe("zahra@studio.com");
  expect(suggestEmail("zahra@studio.comm")).toBe("zahra@studio.com");
});

test("misspelled big providers are corrected", () => {
  expect(suggestEmail("zahra@gmial.com")).toBe("zahra@gmail.com");
  expect(suggestEmail("zahra@hotmial.com")).toBe("zahra@hotmail.com");
  expect(suggestEmail("zahra@yaho.com")).toBe("zahra@yahoo.com");
});

test("matching ignores case but keeps the user's local part as typed", () => {
  expect(suggestEmail("Zahra.W@GMAIL.CON")).toBe("Zahra.W@gmail.com");
});

test("real domains, including lookalikes, are left alone", () => {
  for (const email of [
    "zahra@gmail.com",
    "zahra@mail.com",
    "zahra@husky.neu.edu",
    "zahra@example.co",
    "zahra@studio.cm",
  ]) {
    expect(suggestEmail(email), email).toBeNull();
  }
});
