import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let directory: string;
let bundle: string;
let css: string;
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "tomoji-operator-tests-"));
  execFileSync("bun", ["e2e/fixtures/operator-build.mjs", directory]);
  bundle = readFileSync(join(directory, "operator-entry.js"), "utf8");
  css = readFileSync(join(directory, "operator.css"), "utf8");
});
test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test.use({ timezoneId: "America/New_York" });

type View = "users" | "disputes";

/** Loads the real operator views against a local Convex double. */
async function open(page: Page, view: View) {
  await page.route("http://operator.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/app.js")
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    else if (path === "/app.css") await route.fulfill({ contentType: "text/css", body: css });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><main id="root"></main><script type="module" src="/app.js"></script></body></html>',
      });
  });
  await page.goto(`http://operator.test/?view=${view}`);
}

test("users tabs scope the directory and search matches names and emails", async ({ page }) => {
  await open(page, "users");

  await expect(page.getByRole("row", { name: /Ada Lovelace/ })).toBeVisible();
  // Alan is deactivated, so he is out until asked for.
  await expect(page.getByRole("row", { name: /Alan Turing/ })).toBeHidden();
  await page.getByRole("checkbox", { name: "Show deactivated accounts" }).check();
  await expect(page.getByRole("row", { name: /Alan Turing/ })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Alan Turing/ }).getByText("Deactivated"),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Company users" }).click();
  await expect(page.getByRole("row", { name: /Jordan Lee/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Acme Robotics · Admin" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Ada Lovelace/ })).toBeHidden();

  await page.getByRole("tab", { name: "Operators" }).click();
  await expect(page.getByRole("row", { name: /Robin Shaw/ })).toBeVisible();

  await page.getByRole("tab", { name: "Creators" }).click();
  await page.getByLabel("Search users").fill("grace@example.com");
  await expect(page.getByRole("row", { name: /Grace Hopper/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Ada Lovelace/ })).toBeHidden();

  await page.getByLabel("Search users").fill("turing-not-here");
  await expect(page.getByText("Nothing to show")).toBeVisible();
});

test("deactivating an account calls setActive for that user and reflects it in the row", async ({
  page,
}) => {
  await open(page, "users");

  await page.getByRole("button", { name: "Ada Lovelace" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("ada@example.com")).toBeVisible();
  await modal.getByRole("button", { name: "Deactivate account" }).click();

  expect(await page.evaluate(() => window.operatorFixture.calls)).toEqual([
    { name: "users:setActive", args: { userId: "user-0", isActive: false } },
  ]);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("row", { name: /Ada Lovelace/ })).toBeHidden();
});

test("an open dispute can be closed and a settled one overridden with a required reason", async ({
  page,
}) => {
  await open(page, "disputes");

  await page.getByRole("button", { name: "Incorrect payout amount" }).click();
  let modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Close this dispute" })).toBeVisible();
  // A note is optional when closing, so this sends without one.
  await modal.getByRole("button", { name: "Close dispute" }).click();
  expect(await page.evaluate(() => window.operatorFixture.calls)).toEqual([
    { name: "disputes:resolve", args: { disputeId: "dispute-0", outcome: "approved" } },
  ]);

  await page.getByRole("tab", { name: "Resolved" }).click();
  await page.getByRole("button", { name: "Unfair submission review" }).click();
  modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Override the result" })).toBeVisible();
  await modal.getByRole("button", { name: "Override result" }).click();
  await expect(modal.getByText("Say why you're changing the result.")).toBeVisible();
  expect(await page.evaluate(() => window.operatorFixture.calls.length)).toBe(1);

  await modal.getByLabel("Note").fill("The brief did allow the deploy log.");
  await modal.getByRole("button", { name: "Override result" }).click();
  expect(await page.evaluate(() => window.operatorFixture.calls.at(-1))).toEqual({
    name: "disputes:override",
    args: {
      disputeId: "dispute-2",
      outcome: "approved",
      note: "The brief did allow the deploy log.",
    },
  });
});

test("a dispute Ohani already ruled on offers no further ruling", async ({ page }) => {
  await open(page, "disputes");

  await page.getByRole("button", { name: "Incorrect payout amount" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close dispute" }).click();
  await page.getByRole("tab", { name: "Resolved" }).click();
  await page.getByRole("button", { name: "Incorrect payout amount" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("button", { name: /Close dispute|Override result/ })).toBeHidden();
});
