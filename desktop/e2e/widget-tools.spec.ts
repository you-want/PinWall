import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { WidgetManifest } from "../src/types";
import { test, expect } from "./fixtures/tauri";

async function enable(page: Page, slug: string, button: string) {
  const root = `resources/widgets/widget-${slug}`;
  const manifest = JSON.parse(readFileSync(`${root}/widget.json`, "utf8")) as WidgetManifest;
  const html = readFileSync(`${root}/index.html`, "utf8");
  await page.addInitScript(pkg => {
    if (window === window.top && location.origin === "http://localhost:1932") localStorage.setItem("pinwall-e2e:widgets:package", JSON.stringify(pkg));
  }, { manifest, html });
  await page.goto("/?window=settings");
  await page.getByRole("button", { name: /^Experimental/ }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".ap-widget-catalog-card").filter({ hasText: manifest.name }).getByRole("button", { name: "Install", exact: true }).click();
  const toggle = page.locator(".ap-widget-installed-row").getByRole("checkbox");
  await expect(toggle).not.toBeChecked(); await toggle.check(); await page.goto("/");
  const widget = page.frameLocator(`iframe[title="${manifest.name}"]`);
  await expect(widget.getByRole("button", { name: button, exact: true })).toBeEnabled();
  return { widget, manifest };
}

test("OCR handles chooser cancel and no text, then previews and persists an edited note", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const { widget } = await enable(page, "ocr-note", "Open OCR");
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:ocr:calls"))).toBeNull();
  await widget.getByRole("button", { name: "Open OCR" }).click();
  const dialog = page.getByRole("dialog", { name: "Image to note" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:ocr:calls"))).toBeNull();
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:ocr:cancel", "true"));
  await dialog.getByRole("button", { name: "Choose image and recognize" }).click();
  await expect(dialog.getByRole("button", { name: "Choose image and recognize" })).toBeEnabled();
  await expect(dialog.getByLabel("Note text")).toHaveCount(0);
  await page.evaluate(() => { localStorage.removeItem("pinwall-e2e:ocr:cancel"); localStorage.setItem("pinwall-e2e:ocr:fail", "ocr_no_text"); });
  await dialog.getByRole("button", { name: "Choose image and recognize" }).click();
  await expect(dialog.getByRole("alert")).toContainText("No text found");
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:ocr:fail"));
  await dialog.getByRole("button", { name: "Choose image and recognize" }).click();
  await expect(dialog.getByLabel("Note text")).toHaveValue("Recognized fixture\n本地识字");
  await dialog.getByLabel("Note title").fill("OCR saved note");
  await dialog.getByLabel("Note text").fill("Reviewed recognition\n确认后的文字");
  await page.screenshot({ path: "/tmp/pinwall-ocr-narrow.png", fullPage: true });
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(dialog).toHaveCount(0); await page.reload();
  await expect(page.locator(".pin-card").filter({ hasText: "OCR saved note" }).locator(".card-body")).toHaveText("Reviewed recognition\n确认后的文字");
});

test("cancelling OCR discards late recognition without creating a note", async ({ page }) => {
  const { widget } = await enable(page, "ocr-note", "Open OCR");
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:ocr:delay", "true"));
  await widget.getByRole("button", { name: "Open OCR" }).click();
  const dialog = page.getByRole("dialog", { name: "Image to note" });
  await dialog.getByRole("button", { name: "Choose image and recognize" }).click();
  await expect(dialog.getByRole("button", { name: "Choosing / recognizing…" })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".pin-card").filter({ hasText: "Recognized fixture" })).toHaveCount(0);
});

test("image tools preserve aspect ratio, validate dimensions and export with retry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const { widget } = await enable(page, "image-tools", "Open image tools");
  await widget.getByRole("button", { name: "Open image tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Image tools", exact: true });
  await dialog.getByRole("button", { name: "Choose image", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Selected image preview" })).toBeVisible();
  await dialog.getByLabel("Width (pixels)").fill("400");
  await expect(dialog.getByLabel("Height (pixels)")).toHaveValue("200");
  await dialog.getByLabel("Width (pixels)").fill("9000");
  await expect(dialog.getByRole("alert")).toContainText("Enter dimensions");
  await expect(dialog.getByRole("button", { name: "Choose location and export" })).toBeDisabled();
  await dialog.getByLabel("Width (pixels)").fill("400");
  await dialog.getByLabel("Export format").selectOption("webp");
  await expect(dialog.getByLabel("JPEG quality")).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:images:export-fail", "image_save_failed"));
  await dialog.getByRole("button", { name: "Choose location and export" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Export failed");
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:images:export-fail"));
  await page.screenshot({ path: "/tmp/pinwall-image-tools-narrow.png", fullPage: true });
  await dialog.getByRole("button", { name: "Choose location and export" }).click();
  await expect(dialog.getByRole("status")).toContainText("Exported: 400 × 200");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pinwall-e2e:images:export") ?? "null"))).toEqual({ width: 400, height: 200, format: "webp", quality: 80 });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pinwall-e2e:images:token"))).toBeNull();
});

test("image selection cancellation and corrupt images leave a usable chooser", async ({ page }) => {
  const { widget } = await enable(page, "image-tools", "Open image tools");
  await widget.getByRole("button", { name: "Open image tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Image tools", exact: true });
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:images:cancel", "true"));
  await dialog.getByRole("button", { name: "Choose image", exact: true }).click();
  await expect(dialog.getByRole("img")).toHaveCount(0);
  await page.evaluate(() => { localStorage.removeItem("pinwall-e2e:images:cancel"); localStorage.setItem("pinwall-e2e:images:fail", "image_invalid"); });
  await dialog.getByRole("button", { name: "Choose image", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Choose a valid");
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:images:fail"));
  await dialog.getByRole("button", { name: "Choose image", exact: true }).click();
  await expect(dialog.getByRole("img")).toBeVisible();
});

async function seedHistory(page: Page) {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("pinwall-e2e:history:state") ?? "{}");
    if (!state.recording) throw new Error("Capture was not explicitly started");
    state.entries = [{ id: "1", text: "Captured fixture\n会话文本", createdAt: Date.now() }, { id: "2", text: "Second capture", createdAt: Date.now() }];
    localStorage.setItem("pinwall-e2e:history:state", JSON.stringify(state));
    localStorage.setItem("pinwall-e2e:history:revision", "100");
  });
}

test("history is opt in, searchable, copyable and can create a reviewed note", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const { widget } = await enable(page, "clipboard-history", "Open history");
  await widget.getByRole("button", { name: "Open history" }).click();
  const dialog = page.getByRole("dialog", { name: "Clipboard history", exact: true });
  await expect(dialog.getByRole("status")).toHaveText("Recording paused");
  await dialog.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Recording newly copied text");
  await seedHistory(page);
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await dialog.getByLabel("Search history").fill("会话");
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Copy text", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:clipboard:lastwrite"))).toBe("Captured fixture\n会话文本");
  await page.screenshot({ path: "/tmp/pinwall-history-narrow.png", fullPage: true });
  await dialog.getByRole("button", { name: "Review and create note" }).click();
  const preview = page.getByRole("dialog", { name: "Clipboard to note" });
  await expect(preview.getByLabel("Note text")).toHaveValue("Captured fixture\n会话文本");
  await preview.getByLabel("Note title").fill("History reviewed note");
  await preview.getByRole("button", { name: "Create note" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Clear and pause" }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.locator(".pin-card").filter({ hasText: "History reviewed note" })).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pinwall-e2e:history:state") ?? "{}").entries)).toEqual([]);
});

test("history continues after closing its dialog and disable clears the session", async ({ page }) => {
  const { widget } = await enable(page, "clipboard-history", "Open history");
  await widget.getByRole("button", { name: "Open history" }).click();
  const dialog = page.getByRole("dialog", { name: "Clipboard history", exact: true });
  await dialog.getByRole("button", { name: "Start recording", exact: true }).click();
  await seedHistory(page); await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await dialog.getByRole("listitem").first().getByRole("button", { name: "Delete item" }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(widget.locator("#capture-status")).toHaveText("Recording · 1");
  await page.locator(".widget-frame").click({ button: "right", position: { x: 0, y: 0 } });
  await page.getByRole("button", { name: "Disable widget", exact: true }).click();
  await expect(page.locator(".widget-frame")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pinwall-e2e:history:state") ?? "{}"))).toMatchObject({ recording: false, entries: [] });
});
