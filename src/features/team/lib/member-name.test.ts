import { expect, test } from "vitest";
import { memberName } from "./member-name";

test("joins a member's first and last names", () => {
  expect(memberName({ firstName: "Julia", lastName: "Patel", email: "julia@example.com" })).toBe(
    "Julia Patel",
  );
});

test("uses the first name when the last name is missing", () => {
  expect(memberName({ firstName: "Julia", email: "julia@example.com" })).toBe("Julia");
});

test("uses the last name when the first name is missing", () => {
  expect(memberName({ lastName: "Patel", email: "julia@example.com" })).toBe("Patel");
});

test("falls back to email when neither name is available", () => {
  expect(memberName({ email: "julia@example.com" })).toBe("julia@example.com");
});

test("trims name parts and ignores whitespace-only names", () => {
  expect(
    memberName({ firstName: " Julia ", lastName: " Patel ", email: "julia@example.com" }),
  ).toBe("Julia Patel");
  expect(memberName({ firstName: " ", lastName: " ", email: "julia@example.com" })).toBe(
    "julia@example.com",
  );
});
