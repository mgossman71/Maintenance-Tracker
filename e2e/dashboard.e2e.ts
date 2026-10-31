import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * M7 hero screen: urgency ordering, the stale-meter banner with inline
 * update / same-reading, and quick "Done" with a prefilled meter.
 * Cleans up its equipment — later specs assume an empty vault.
 */

/** The dashboard block's equipment id, from its detail link. */
async function blockIdFor(page: Page, name: string): Promise<string> {
  const href = await page
    .locator('[data-testid^="dash-block-"]')
    .getByRole("link", { name })
    .first()
    .getAttribute("href");
  return (href ?? "").split("/").pop() ?? "";
}

test.describe("dashboard", () => {
  test("a back-dated service makes a task overdue — the hero leads with it", async ({ page }) => {
    await login(page);

    // metered equipment + interval task, then a service done 13 months ago
    await page.goto("/equipment");
    await page.getByTestId("add-equipment-button").click();
    await page.getByTestId("create-name").fill("Rush Rocket");
    await page.getByTestId("create-meter").selectOption("miles");
    await page.getByTestId("create-submit").click();

    await page.getByRole("link", { name: "Rush Rocket" }).click();
    await page.getByTestId("tab-tasks").click();
    await page.getByTestId("add-task-button").click();
    await page.getByTestId("create-preset").selectOption("custom");
    await page.getByTestId("create-task-name").fill("Wax job");
    await page.getByTestId("create-months").fill("12");
    await page.getByTestId("create-task-submit").click();

    // record the last time it was done — 13 months ago → overdue since May
    await page.getByTestId("tab-history").click();
    await page.getByTestId("record-work-button").click();
    const wax = page.getByRole("option", { name: /^Wax job/ }).first();
    await page.getByTestId("create-target").selectOption((await wax.getAttribute("value")) ?? "");
    await page.getByTestId("create-date").fill("2025-05-01");
    await page.getByTestId("create-submit").click();

    // the hero: totals, the overdue chip, and the never-recorded nag
    await page.goto("/");
    await expect(page.getByTestId("dashboard-totals")).toContainText("1 overdue");
    const id = await blockIdFor(page, "Rush Rocket");
    const block = page.getByTestId(`dash-block-${id}`);
    await expect(block.getByTestId("due-chip-overdue")).toBeVisible();
    await expect(block.getByTestId("stale-meter-banner")).toContainText("No meter reading yet");
  });

  test("banner: update reading inline — the nag clears", async ({ page }) => {
    await login(page);
    const block = page.getByTestId(`dash-block-${await blockIdFor(page, "Rush Rocket")}`);

    await block.getByRole("button", { name: "Update reading" }).click();
    await page.getByTestId("banner-reading-input").fill("5000");
    await page.getByTestId("banner-reading-submit").click();

    await expect(block.getByTestId("stale-meter-banner")).toHaveCount(0);
    await expect(block).toContainText("5,000 mi");
  });

  test("quick Done: prefilled meter, records work, chip flips to OK", async ({ page }) => {
    await login(page);
    const block = page.getByTestId(`dash-block-${await blockIdFor(page, "Rush Rocket")}`);

    await block.getByRole("button", { name: "Done" }).click();
    // prefilled: the task is selected and the meter rides along
    await expect(page.getByTestId("quick-target")).not.toHaveValue("");
    await expect(page.getByTestId("quick-meter")).toHaveValue("5000");
    await page.getByTestId("quick-submit").click();

    await expect(block.getByTestId("due-chip-ok")).toBeVisible();
    await expect(page.getByTestId("dashboard-totals")).toContainText("Everything is on schedule");
  });

  test("the hero speaks intervals: every N, due in N miles — editable in place", async ({
    page,
  }) => {
    await login(page);

    // the reported flow: first service due AT 1,000 miles, 600 on the clock
    await page.goto("/equipment");
    await page.getByTestId("add-equipment-button").click();
    await page.getByTestId("create-name").fill("Trail Bike");
    await page.getByTestId("create-meter").selectOption("miles");
    await page.getByTestId("create-interval").fill("1000");
    await page.getByTestId("create-submit").click();

    await page.getByRole("link", { name: "Trail Bike" }).click();
    await page.getByTestId("tab-info").click();
    await page.getByTestId("reading-input").fill("600");
    await page.getByTestId("reading-submit").click();

    // the dashboard row states the interval AND the miles to go, plainly
    await page.goto("/");
    const block = page.getByTestId(`dash-block-${await blockIdFor(page, "Trail Bike")}`);
    const row = block.locator("li").filter({ hasText: "Service" });
    await expect(row).toContainText("every 12 mo or 1,000 mi");
    await expect(row).toContainText("due in 400 mi");

    // change the maintenance interval right from the dashboard: 1,000 → 1,200
    await row.getByRole("button", { name: "Edit Service" }).click();
    await expect(page.getByTestId("dash-edit-meter")).toHaveValue("1000");
    await page.getByTestId("dash-edit-meter").fill("1200");
    await page.getByTestId("dash-edit-task-submit").click();

    await expect(row).toContainText("every 12 mo or 1,200 mi");
    await expect(row).toContainText("due in 600 mi");

    // self-clean: later specs assume an empty vault (dialog-scoped: other
    // equipment's closed delete-dialogs carry the same testid in the DOM)
    await page.goto("/equipment");
    await page.getByRole("button", { name: "Delete Trail Bike" }).click();
    await page.getByRole("dialog").getByTestId("confirm-button").click();
  });

  test("banner: stale again via an old date, cleared by Same reading", async ({ page }) => {
    await login(page);
    const id = await blockIdFor(page, "Rush Rocket");

    // age the reading explicitly (a fixed past date is stale vs any "now")
    await page.goto(`/equipment/${id}`);
    await page.getByTestId("reading-input").fill("5001");
    await page.getByTestId("reading-date").fill("2025-01-01");
    await page.getByTestId("reading-submit").click();

    await page.goto("/");
    const block = page.getByTestId(`dash-block-${id}`);
    await expect(block.getByTestId("stale-meter-banner")).toContainText("Meter last read");
    await block.getByTestId("banner-same-reading").click();
    await expect(block.getByTestId("stale-meter-banner")).toHaveCount(0);
  });

  test("cleanup: remove the test equipment", async ({ page }) => {
    await login(page);
    await page.goto("/equipment");
    await page.getByRole("button", { name: "Delete Rush Rocket" }).click();
    await page.getByTestId("confirm-button").click();
    await expect(page.getByText("No equipment yet")).toBeVisible();
  });
});
