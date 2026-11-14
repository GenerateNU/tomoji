import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Id } from "../convex/_generated/dataModel";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-profile-tests-"));
  execFileSync("bun", [
    "e2e/fixtures/settings-build.mjs",
    fixtureDirectory,
    "e2e/fixtures/profile-entry.tsx",
  ]);
  bundle = readFileSync(join(fixtureDirectory, "profile-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "settings.css"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

// Real Profile components with isolated query/media responses; no account writes.
async function openProfile(page: Page, query = "") {
  await page.route("http://profile.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/profile.js") {
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    } else if (path === "/profile.css") {
      await route.fulfill({ contentType: "text/css", body: css });
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/profile.css"></head><body><div id="root"></div><script type="module" src="/profile.js"></script></body></html>',
      });
    }
  });
  await page.goto(`http://profile.test/profile${query}`);
  if (!query.includes("navOnly")) {
    await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  }
}

test("editing profile opens one form and cancelling preserves the saved profile", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("GitHub profile", { exact: true })
    .fill("https://github.com/unsaved-profile");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/zahra",
  );
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("creators see saved profile details and statistics without private email", async ({
  page,
}) => {
  await openProfile(page);
  await expect(page.getByRole("heading", { name: "Zahra Wibisana", exact: true })).toBeVisible();
  await expect(page.getByText("Indonesia", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveAttribute(
    "href",
    "https://github.com/zahra",
  );
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("zahra@example.test", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Followers", { exact: true })).toBeVisible();
  await expect(page.getByText("231,221", { exact: true })).toBeVisible();
  await expect(page.getByText("Joined November 2026", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("content type preview can be saved locally and cancelling discards its draft", async ({
  page,
}) => {
  await openProfile(page);
  await expect(page.getByText("Tutorials & how-to", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: "Content type", exact: true }).click();
  await page.getByRole("checkbox", { name: "Tutorials & how-to", exact: true }).uncheck();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByText("Tutorials & how-to", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: "Content type", exact: true }).click();
  await page.getByRole("checkbox", { name: "Tutorials & how-to", exact: true }).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Tutorials & how-to", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("mixed profile edits save only real fields and preserve demo edits across a failed save", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: "Content type", exact: true }).click();
  await page.getByRole("checkbox", { name: "Tutorials & how-to", exact: true }).uncheck();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("GitHub profile", { exact: true }).fill("https://github.com/mixed");
  await page.evaluate(() => window.profileFixture.failNext("creators:update"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("GitHub profile", { exact: true })).toHaveValue(
    "https://github.com/mixed",
  );
  await page.getByRole("combobox", { name: "Content type", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Tutorials & how-to", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveAttribute(
    "href",
    "https://github.com/mixed",
  );
  await expect(page.getByText("Tutorials & how-to", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    { name: "creators:update", args: { githubLink: "https://github.com/mixed" } },
    { name: "creators:update", args: { githubLink: "https://github.com/mixed" } },
  ]);
});

test("a failed navigation query preserves the shared shell and Profile returns when it recovers", async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await openProfile(page, "?navOnly&failedQuery=users%3Ame");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "href",
    "/settings",
  );
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.profileFixture.setSession({ failedQuery: "" }));
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveAttribute(
    "href",
    "/profile",
  );
  expect(errors).toEqual([]);
});

test("signed-out component state prompts sign-in without requesting profile data", async ({
  page,
}) => {
  await openProfile(page, "?auth=signed-out");
  await expect(page.getByRole("link", { name: "sign in", exact: true })).toHaveAttribute(
    "href",
    "/login?next=%2Fprofile",
  );
  await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([]);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("authentication, user, and profile loading each resolve before displaying creator details", async ({
  page,
}) => {
  await openProfile(page, "?auth=loading&account=loading&profile=loading");
  await expect(page.getByText("Loading profile…", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([]);

  await page.evaluate(() =>
    window.profileFixture.setSession({ isAuthenticated: true, isLoading: false }),
  );
  await expect(page.getByText("Loading profile…", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
    { name: "users:me", args: {} },
  ]);

  await page.evaluate(() => window.profileFixture.setSession({ userLoading: false }));
  await expect(page.getByText("Loading profile…", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
    { name: "users:me", args: {} },
    { name: "creators:me", args: {} },
  ]);
  await page.evaluate(() => window.profileFixture.setSession({ profileLoading: false }));
  await expect(page.getByRole("heading", { name: "Zahra Wibisana" })).toBeVisible();
});

test("unsynced accounts wait for account setup before requesting creator data", async ({
  page,
}) => {
  await openProfile(page, "?account=unsynced");
  await expect(page.getByRole("status")).toHaveText(
    "We’re finishing setting up your account. Your profile will appear here shortly.",
  );
  await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
    { name: "users:me", args: {} },
  ]);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
  await page.evaluate(() => window.profileFixture.setSession({ synced: true }));
  await expect(page.getByRole("heading", { name: "Zahra Wibisana" })).toBeVisible();
});

for (const role of ["company", "operator"]) {
  test(`${role} accounts do not load creator profiles or pictures`, async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await openProfile(page, `?role=${role}`);
    await expect(
      page.getByText("Creator profiles are currently available for creator accounts."),
    ).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
      { name: "users:me", args: {} },
    ]);
    expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("missing profile fields have clear empty states without exposing email fallback names", async ({
  page,
}) => {
  await openProfile(page);
  await page.evaluate(() =>
    window.profileFixture.setProfile({
      firstName: "zahra@example.test",
      lastName: "",
      githubLink: undefined,
      countryOfResidence: undefined,
    }),
  );
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();
  await expect(page.getByText("Indonesia", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveCount(0);
  await expect(page.getByAltText("Your profile picture", { exact: true })).toHaveCount(0);
  await expect(page.getByText("zahra@example.test", { exact: true })).toHaveCount(0);
  await expect(page.getByText("+1 617 555 0100", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("unsafe legacy GitHub URLs are never rendered as clickable links", async ({ page }) => {
  await openProfile(page);
  for (const githubLink of [
    "javascript:alert(1)",
    "https://github.com.evil.test/zahra",
    "https://example.test/zahra",
  ]) {
    await page.evaluate((link) => window.profileFixture.setGithubLink(link), githubLink);
    await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveCount(0);
    await expect(page.getByRole("link").filter({ hasText: githubLink })).toHaveCount(0);
    expect(
      await page
        .locator("a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    ).toEqual(["/profile"]);
  }
});

test("live updates refresh the displayed name, country, and GitHub URL", async ({ page }) => {
  await openProfile(page);
  await page.evaluate(() =>
    window.profileFixture.setProfile({
      firstName: "Alex",
      lastName: "Chen",
      githubLink: "https://github.com/alex-builds",
      countryOfResidence: "JP",
    }),
  );
  await expect(page.getByRole("heading", { name: "Alex Chen", exact: true })).toBeVisible();
  await expect(page.getByText("Japan", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveAttribute(
    "href",
    "https://github.com/alex-builds",
  );
  await expect(page.getByText("Indonesia", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("private pictures load through the existing media reader and recover after a failed request", async ({
  page,
}) => {
  await openProfile(page);
  await page.evaluate(() => {
    window.profileFixture.failNext("media:getProfilePicture");
    window.profileFixture.setProfile({
      profilePictureMediaId: "test-picture" as Id<"mediaUploads">,
    });
  });
  await expect(
    page.getByText("We couldn't load your picture. Try again or choose another one."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zahra Wibisana" })).toBeVisible();
  await page.getByRole("button", { name: "Retry picture", exact: true }).click();
  const picture = page.getByAltText("Your profile picture", { exact: true });
  await expect(picture).toBeVisible();
  await expect(picture).toHaveJSProperty("naturalWidth", 1);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    { name: "media:getProfilePicture", args: { mediaId: "test-picture" } },
    { name: "media:getProfilePicture", args: { mediaId: "test-picture" } },
  ]);
});

test("removing a picture while its request is pending does not restore stale image data", async ({
  page,
}) => {
  await openProfile(page);
  await page.evaluate(() => {
    window.profileFixture.delayNext("media:getProfilePicture");
    window.profileFixture.setProfile({
      profilePictureMediaId: "test-picture" as Id<"mediaUploads">,
    });
  });
  await expect.poll(() => page.evaluate(() => window.profileFixture.calls.length)).toBe(1);
  await page.evaluate(() => {
    window.profileFixture.setProfile({ profilePictureMediaId: undefined });
    window.profileFixture.release("media:getProfilePicture");
  });
  await expect(page.getByAltText("Your profile picture", { exact: true })).toHaveCount(0);
  await expect(page.getByAltText("Your profile picture", { exact: true })).toHaveCount(0);
});

test("creator profile fits desktop and mobile with long names and links", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await openProfile(page);
  await expect(page.getByRole("heading", { name: "Zahra Wibisana", exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("profile-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() =>
    window.profileFixture.setProfile({
      firstName: "AnExtremelyLongFirstNameForResponsiveLayout",
      lastName: "AnEquallyLongLastNameForTheCreatorProfile",
      githubLink: "https://github.com/an-extremely-long-creator-username",
    }),
  );
  await page.getByRole("link", { name: /GitHub profile/ }).focus();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("profile-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("signed-out visitors to the actual Profile route land on log in", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("profile saves only changed fields and can clear GitHub without changing other data", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByLabel("GitHub profile", { exact: true }).fill("github.com/new-profile");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveAttribute(
    "href",
    "https://github.com/new-profile",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("GitHub profile", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    { name: "creators:update", args: { githubLink: "https://github.com/new-profile" } },
    { name: "creators:update", args: { githubLink: null } },
  ]);
});

test("external updates preserve a draft and cancelling reveals the latest saved data", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("GitHub profile", { exact: true }).fill("https://github.com/draft");
  await page.evaluate(() =>
    window.profileFixture.setGithubLink("https://github.com/updated-elsewhere"),
  );
  await expect(page.getByLabel("GitHub profile", { exact: true })).toHaveValue(
    "https://github.com/draft",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveAttribute(
    "href",
    "https://github.com/updated-elsewhere",
  );
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("validation blocks invalid GitHub and a failed save preserves the draft for retry", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const github = page.getByLabel("GitHub profile", { exact: true });
  await github.fill("https://example.test/not-github");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(github).toHaveAttribute("aria-invalid", "true");
  await expect(github).toBeFocused();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
  await github.fill("https://github.com/updated");
  await page.evaluate(() => window.profileFixture.failNext("creators:update"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Something went wrong");
  await expect(github).toHaveValue("https://github.com/updated");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: /GitHub profile/ })).toHaveAttribute(
    "href",
    "https://github.com/updated",
  );
});

test("saving disables editing and duplicate submissions until the mutation completes", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("GitHub profile", { exact: true }).fill("https://github.com/pending");
  await page.evaluate(() => window.profileFixture.delayNext("creators:update"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(page.getByLabel("GitHub profile", { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.profileFixture.calls)).toHaveLength(1);
  await page.evaluate(() => window.profileFixture.release("creators:update"));
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("birthdate and country edits use the existing API fields", async ({ page }) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Date of birth", { exact: true }).fill("1990-01-01");
  await page.getByRole("combobox", { name: "Country of residence", exact: true }).click();
  await page.getByRole("option", { name: "Japan", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Japan", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    {
      name: "creators:update",
      args: { dateOfBirth: Date.UTC(1990, 0, 1), countryOfResidence: "JP" },
    },
  ]);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: "Country of residence", exact: true }).click();
  await page.getByRole("option", { name: "Not selected", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Japan", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls.at(-1))).toEqual({
    name: "creators:update",
    args: { countryOfResidence: null },
  });
});

test("underage birthdates and clearing an existing birthdate cannot be saved", async ({ page }) => {
  await openProfile(page);
  await page.evaluate(() =>
    window.profileFixture.setProfile({ dateOfBirth: Date.UTC(1990, 0, 1) }),
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const field = page.getByLabel("Date of birth", { exact: true });
  const tooYoung = new Date(Date.now() - 17 * 365 * 24 * 60 * 60 * 1000);
  await field.fill(tooYoung.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at least 18");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("can't be removed");
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("LinkedIn and additional links normalize and preserve their order", async ({ page }) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("LinkedIn profile", { exact: true }).fill("  linkedin.com/in/zahra  ");
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByLabel("Link 1", { exact: true }).fill("https://zahra.example.test/work");
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByLabel("Link 2", { exact: true }).fill("https://notes.example.test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    {
      name: "creators:update",
      args: {
        linkedinLink: "https://linkedin.com/in/zahra",
        additionalLinks: ["https://zahra.example.test/work", "https://notes.example.test/"],
      },
    },
  ]);
});

test("invalid additional links identify the field and adding links respects the backend limit", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const add = page.getByRole("button", { name: "Add link", exact: true });
  for (let index = 0; index < 3; index++) await add.click();
  await expect(add).toBeDisabled();
  await page.getByLabel("Link 1", { exact: true }).fill("https://fine.example.test");
  await page.getByLabel("Link 2", { exact: true }).fill("http://insecure.example.test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("secure URL");
  await expect(page.getByLabel("Link 2", { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
  await page.getByRole("button", { name: "Remove link 2", exact: true }).click();
  await expect(add).toBeEnabled();
});

test("supported taxonomy selections persist and render labels on the profile", async ({ page }) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const nicheTrigger = page.getByRole("combobox", { name: "Niches", exact: true });
  await expect(nicheTrigger).toHaveText("Select niches");
  for (const [field, option] of [
    ["Languages", "English"],
    ["Niches", "Backend Development"],
    ["Skills", "TypeScript"],
  ]) {
    await page.getByRole("combobox", { name: field, exact: true }).click();
    await page.getByRole("checkbox", { name: option, exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
  }
  await expect(nicheTrigger.getByText("Backend Development", { exact: true })).toBeVisible();
  await expect(nicheTrigger.getByText(/^\+\d+$/)).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("English", { exact: true })).toBeVisible();
  await expect(page.getByText("Backend Development", { exact: true })).toBeVisible();
  await expect(page.getByText("TypeScript", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    {
      name: "creators:update",
      args: { languages: ["english"], niches: ["backend-development"], skills: ["typescript"] },
    },
  ]);
  expect(
    await page.evaluate(() =>
      window.profileFixture.queries.filter(({ name }) => name.endsWith(":list")),
    ),
  ).toEqual([]);
});

test("niches summarize hidden selections without removing them from the dropdown or save", async ({
  page,
}) => {
  await openProfile(page);
  await page.evaluate(() =>
    window.profileFixture.setProfile({
      niches: ["backend-development", "generative-ai", "design", "frontend-development"],
    }),
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const trigger = page.getByRole("combobox", { name: "Niches", exact: true });
  await expect(trigger.getByText("Backend Development", { exact: true })).toBeVisible();
  await expect(trigger.getByText("+3", { exact: true })).toBeVisible();
  await expect(trigger.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  for (const label of ["Generative AI & LLMs", "UI / UX Design", "Frontend Development"]) {
    await expect(trigger.getByText(label, { exact: true })).toHaveCount(0);
  }
  await trigger.click();
  for (const label of [
    "Backend Development",
    "Generative AI & LLMs",
    "UI / UX Design",
    "Frontend Development",
  ]) {
    await expect(page.getByRole("checkbox", { name: label, exact: true })).toBeChecked();
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await trigger.getByRole("button", { name: "Remove Backend Development", exact: true }).click();
  await expect(trigger.getByText("Generative AI & LLMs", { exact: true })).toBeVisible();
  await expect(trigger.getByText("+2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    {
      name: "creators:update",
      args: { niches: ["generative-ai", "design", "frontend-development"] },
    },
  ]);
});

test("unsupported X and photo actions stay unavailable and do not make service calls", async ({
  page,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Link X", exact: true })).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("more than five languages is rejected and focuses the invalid selector", async ({ page }) => {
  await openProfile(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("combobox", { name: "Languages", exact: true }).click();
  for (const language of ["English", "Spanish", "French", "Japanese", "German", "Italian"]) {
    await page.getByRole("checkbox", { name: language, exact: true }).click();
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Choose up to 5 languages.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Languages", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "Languages", exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});
