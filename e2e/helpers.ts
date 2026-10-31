import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

/**
 * Ensure a logged-in session on the shared vault (files run in order,
 * single worker). Handles both states: the auth suite's vault (login) and
 * a pristine one (runs setup itself) — so a filtered run works too.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  // the login page renders nothing until the auth-status query settles —
  // wait for whichever screen materializes, then drive it
  await page.getByTestId("setup-form").or(page.getByTestId("password-input")).first().waitFor();
  if (await page.getByTestId("setup-form").isVisible()) {
    await page.getByTestId("setup-password").fill(PASSWORD);
    await page.getByTestId("setup-confirm").fill(PASSWORD);
    await page.getByTestId("setup-submit").click();
  } else {
    await page.getByTestId("password-input").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
  }
  await expect(page.getByTestId("dashboard-page")).toBeVisible();
}
