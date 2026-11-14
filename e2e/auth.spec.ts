import { expect, test } from "@playwright/test";

// These cover what happens before WorkOS is called, so they need no account.

test("signed-out visitors to app pages land on log in", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/login\?next=%2Fopportunities$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("signed-out visitors to home land on log in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("signed-out visitors to workspace members land on log in", async ({ page }) => {
  await page.goto("/team");
  await expect(page).toHaveURL(/\/login\?next=%2Fteam$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("log in, sign up and forgot password link to each other", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Tomoji!" })).toBeVisible();

  await page.getByRole("link", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("an empty sign-up shows every required field and focuses the first", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Get started" }).click();

  for (const message of [
    "First name required",
    "Last name required",
    "Email required",
    "Password required",
  ]) {
    await expect(page.getByText(message)).toBeVisible();
  }
  await expect(page.getByLabel("First name")).toBeFocused();
  await expect(page.getByLabel("First name")).toHaveAttribute("aria-invalid", "true");
});

test("fixing a field clears its error as the user types", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("zahra@");
  await page.getByLabel("Password").focus();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();

  await page.getByLabel("Email").fill("zahra@example.com");
  await expect(page.getByText("Enter a valid email address.")).toBeHidden();
});

// Google sign-in is hidden for now; re-enable with the buttons in the auth forms.
test.skip("the Google button starts our own Google flow", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
    "href",
    "/auth/google",
  );
});

test("a reset link without its token explains what to do", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByText("This link is missing its reset code.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});

test("verify email without a pending sign-in sends the user back to log in", async ({ page }) => {
  await page.goto("/verify-email");
  await expect(page.getByText("This sign-in has expired.")).toBeVisible();
});

// Google sign-in is hidden for now; re-enable with the buttons in the auth forms.
test.skip("a failed Google sign-in is explained on the log-in page", async ({ page }) => {
  await page.goto("/login?error=google");
  // Filtered because Next.js's route announcer is also role="alert".
  await expect(
    page.getByRole("alert").filter({ hasText: "Google sign-in didn't finish. Try again." }),
  ).toBeVisible();
});
