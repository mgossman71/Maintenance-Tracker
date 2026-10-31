import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 12, 13, 14]);
const PDF = Buffer.from("%PDF-1.4\nferry title page\n");

function row(page: Page, title: string) {
  return page.getByTestId("history-pane").locator("li").filter({ hasText: title });
}

test.describe("history, photos, documents (§8/M6)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("record metered task work — the meter follows the history", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByTestId("add-equipment-button").click();
    await page.getByTestId("create-name").fill("Photo Ferry");
    await page.getByTestId("create-meter").selectOption("hours");
    await page.getByTestId("create-submit").click();

    await page.getByRole("link", { name: "Photo Ferry" }).click();
    await page.getByTestId("tab-tasks").click();
    await page.getByTestId("add-task-button").click();
    const option = page.getByRole("option", { name: /^Impeller/ }).first();
    await page
      .getByTestId("create-preset")
      .selectOption((await option.getAttribute("value")) ?? "custom");
    await page.getByTestId("create-task-submit").click();

    await page.getByTestId("tab-history").click();
    await page.getByTestId("record-work-button").click();
    const taskOption = page.getByRole("option", { name: /^Impeller/ }).first();
    await page
      .getByTestId("create-target")
      .selectOption((await taskOption.getAttribute("value")) ?? "");
    await page.getByTestId("create-date").fill("2026-06-01");
    await page.getByTestId("create-meter").fill("120");
    await page.getByTestId("create-submit").click();

    await expect(row(page, "Impeller")).toContainText("120 h");
    // and the equipment meter moved with it
    await page.getByTestId("tab-info").click();
    await expect(page.getByTestId("meter-current")).toContainText("120 h");
  });

  test("doubt flow: a job recorded without the meter stays honest about it", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: "Photo Ferry" }).click();
    await page.getByTestId("tab-history").click();
    await page.getByTestId("record-work-button").click();

    // the doubt hint shows whenever the meter field is empty
    await expect(page.getByTestId("create-doubt-hint")).toBeVisible();
    await page.getByTestId("create-target").selectOption("label");
    await page.getByTestId("create-label").fill("Cover up");
    await page.getByTestId("create-date").fill("2026-07-01");
    await page.getByTestId("create-submit").click();

    await expect(row(page, "Cover up")).toBeVisible();
    await expect(row(page, "Cover up")).toContainText("no meter reading");
    // meter untouched by the unsure job
    await page.getByTestId("tab-info").click();
    await expect(page.getByTestId("meter-current")).toContainText("120 h");
  });

  test("photos: PNG lands, PDF gets refused", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: "Photo Ferry" }).click();
    await page.getByTestId("tab-history").click();

    await row(page, "Cover up").locator("input[type='file']").setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(row(page, "Cover up").getByTestId("photo-thumb")).toBeVisible();

    await row(page, "Cover up").locator("input[type='file']").setInputFiles({
      name: "invoice.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await expect(row(page, "Cover up").getByText(/PNG, JPEG, GIF or WEBP/)).toBeVisible();
    // still exactly one photo — the PDF never became one
    await expect(row(page, "Cover up").getByTestId("photo-thumb")).toHaveCount(1);
  });

  test("documents: upload, download disposition, delete", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: "Photo Ferry" }).click();
    await page.getByTestId("tab-documents").click();

    await page.getByTestId("document-input").setInputFiles({
      name: "ferry-manual.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    const docRow = page
      .getByTestId("documents-pane")
      .locator("li")
      .filter({ hasText: "ferry-manual.pdf" });
    await expect(docRow).toBeVisible();
    await expect(docRow.locator("a")).toHaveAttribute("href", /^\/api\/attachments\//);

    // the server really answers with attachment disposition (§6.8)
    const href = (await docRow.locator("a").getAttribute("href")) ?? "";
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment;/);

    await docRow.getByRole("button", { name: "Delete ferry-manual.pdf" }).click();
    await page.getByTestId("confirm-button").click();
    await expect(docRow).toHaveCount(0);
  });

  test("cascade: deleting the meter-setting work rolls the meter back", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: "Photo Ferry" }).click();
    await page.getByTestId("tab-history").click();

    await row(page, "Impeller").getByRole("button", { name: "Delete Impeller" }).click();
    await page.getByTestId("confirm-button").click();
    await expect(row(page, "Impeller")).toHaveCount(0);

    await page.getByTestId("tab-info").click();
    await expect(page.getByTestId("meter-current")).toContainText("No reading recorded yet");
  });
});
