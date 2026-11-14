import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let directory: string;
let bundle: string;
let css: string;
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "tomoji-invites-tests-"));
  execFileSync("bun", ["e2e/fixtures/invites-build.mjs", directory]);
  bundle = readFileSync(join(directory, "invites-entry.js"), "utf8");
  css = readFileSync(join(directory, "invites.css"), "utf8");
});
test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

/** Renders real invitation controls without sending email or changing a deployment. */
async function openInvites(page: Page, scenario = "admin") {
  await page.route("http://invites.test/**", async (route) => {
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
  await page.goto(`http://invites.test/?scenario=${scenario}`);
}

test("sends the selected role once and shows a dismissible confirmation toast", async ({
  page,
}, testInfo) => {
  await openInvites(page);
  await page.getByRole("button", { name: "Invite New Members" }).click();
  await page.getByLabel("Email", { exact: true }).fill("  ryan@example.com  ");
  await page.getByLabel("Admin", { exact: true }).check();
  await page.evaluate(() => {
    window.invitesFixture.hold = true;
  });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("button", { name: "Sending" })).toBeDisabled();
  await page.evaluate(() => window.invitesFixture.release?.());
  await expect(
    page
      .getByRole("region", { name: /Notifications/ })
      .getByText("Invitation sent to ryan@example.com.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/WorkOS/)).toHaveCount(0);
  expect(await page.evaluate(() => window.invitesFixture.calls)).toEqual([
    { name: "invites:inviteTeammate", args: { email: "ryan@example.com", role: "admin" } },
  ]);
  await expect(
    page.getByRole("region", { name: "Pending invitations", exact: true }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("invitation-toast-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .getByRole("region", { name: /Notifications/ })
      .getByText("Invitation sent to ryan@example.com.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("invitation-toast-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Close toast", exact: true }).click();
  await expect(
    page.getByText("Invitation sent to ryan@example.com.", { exact: true }),
  ).toBeHidden();
});

test("confirms revocation and keeps the row until the webhook arrives", async ({ page }) => {
  await openInvites(page);
  const row = page.getByRole("listitem").filter({ hasText: "zahra@example.com" });
  await row.getByRole("button", { name: "Cancel invitation" }).click();
  await row.getByRole("button", { name: "Keep invitation" }).click();
  expect(await page.evaluate(() => window.invitesFixture.calls)).toEqual([]);
  await row.getByRole("button", { name: "Cancel invitation" }).click();
  await row.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(row.getByText("Cancellation requested", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: /Notifications/ })
      .getByText("Cancellation requested.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/WorkOS/)).toHaveCount(0);
  expect(await page.evaluate(() => window.invitesFixture.calls)).toEqual([
    { name: "invites:revokeMine", args: { inviteId: "invite-0" } },
  ]);
  await page.evaluate(() => window.invitesFixture.webhook());
  await expect(row).toBeHidden();
});

test("shows a duplicate-invitation error without clearing the form", async ({ page }) => {
  await openInvites(page);
  await page.getByRole("button", { name: "Invite New Members" }).click();
  await page.getByLabel("Email", { exact: true }).fill("not-an-email");
  await page.getByRole("button", { name: "Send invitation" }).click();
  expect(await page.evaluate(() => window.invitesFixture.calls)).toEqual([]);
  await page.getByLabel("Email", { exact: true }).fill("ryan@example.com");
  await page.evaluate(() => {
    window.invitesFixture.fail = true;
  });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert")).toContainText("pending invitation");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("ryan@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    page
      .getByRole("region", { name: /Notifications/ })
      .getByText("Invitation sent to ryan@example.com.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/WorkOS/)).toHaveCount(0);
});

test("a failed cancellation keeps its confirmation and allows a deliberate retry", async ({
  page,
}) => {
  await openInvites(page);
  const row = page.getByRole("listitem").filter({ hasText: "zahra@example.com" });
  await row.getByRole("button", { name: "Cancel invitation" }).click();
  await page.evaluate(() => {
    window.invitesFixture.fail = true;
  });
  await row.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await expect(row.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();
  await row.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(row.getByText("Cancellation requested", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: /Notifications/ })
      .getByText("Cancellation requested.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/WorkOS/)).toHaveCount(0);
});

test("skips admin queries for members, creators, and unsynced users", async ({ page }) => {
  await openInvites(page, "member");
  await expect(page.getByRole("alert")).toContainText("company admins");
  expect(await page.evaluate(() => window.invitesFixture.queries)).toEqual([]);
  await page.goto("http://invites.test/?scenario=creator");
  await expect(page.getByRole("alert")).toContainText("company admins");
  expect(await page.evaluate(() => window.invitesFixture.queries)).toEqual([]);
  await page.goto("http://invites.test/?scenario=unsynced");
  await expect(page.getByRole("status")).toContainText("setting up");
  expect(await page.evaluate(() => window.invitesFixture.queries)).toEqual([]);
});

test("waits for authentication and paginates the pending list", async ({ page }) => {
  await openInvites(page, "auth");
  await expect(page.getByRole("status")).toContainText("Loading invitations");
  expect(await page.evaluate(() => window.invitesFixture.queries)).toEqual([]);
  await page.evaluate(() => window.invitesFixture.ready());
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await page.goto("http://invites.test/?scenario=empty");
  await expect(page.getByText("No pending invitations")).toBeVisible();
});

test("captures the responsive invitation page", async ({ page }) => {
  await openInvites(page);
  await page.getByRole("button", { name: "Invite New Members" }).click();
  await page.getByLabel("Email", { exact: true }).fill("new-teammate@example.com");
  await page.screenshot({ path: test.info().outputPath("invites-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("invites-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
