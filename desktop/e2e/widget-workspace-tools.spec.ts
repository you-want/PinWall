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

test("shelf adds only selected references, searches, retries exports and restores after reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const { widget } = await enable(page, "file-shelf", "Open shelf");
  await widget.getByRole("button", { name: "Open shelf" }).click();
  const dialog = page.getByRole("dialog", { name: "File shelf", exact: true });
  await expect(dialog.getByRole("listitem")).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:shelf:cancel", "true"));
  await dialog.getByRole("button", { name: "Add files" }).click();
  await expect(dialog.getByRole("button", { name: "Add files" })).toBeEnabled();
  await expect(dialog.getByRole("listitem")).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:shelf:cancel"));
  await dialog.getByRole("button", { name: "Add files" }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Add files" }).click();
  await expect(dialog.getByRole("status")).toContainText("Skipped");
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await dialog.getByLabel("Search filenames").fill("document");
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Reveal in Finder" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pinwall-e2e:shelf:reveal"))).toBe("1-2-3");
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:shelf:operation-fail", "tool_io_failed"));
  await dialog.getByRole("button", { name: "Save a copy" }).click();
  await expect(dialog.getByRole("alert")).toContainText("File operation did not complete");
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:shelf:operation-fail"));
  await dialog.getByRole("button", { name: "Save a copy" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pinwall-e2e:shelf:export"))).toBe("1-2-3");
  await page.screenshot({ path: "/tmp/pinwall-shelf-narrow.png", fullPage: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.frameLocator('iframe[title="文件暂存 / File Shelf"]').getByRole("button", { name: "Open shelf" }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await dialog.getByRole("listitem").first().getByRole("button", { name: "Remove reference" }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  page.once("dialog", dialog => dialog.accept());
  await dialog.getByRole("button", { name: "Clear references" }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(0);
});

test("shelf accepts native drop events only while its host dialog is open", async ({ page }) => {
  const { widget } = await enable(page, "file-shelf", "Open shelf");
  await page.evaluate(() => window.dispatchEvent(new Event("pinwall-e2e:shelf-drop")));
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:shelf:entries"))).toBeNull();
  await widget.getByRole("button", { name: "Open shelf" }).click();
  const dialog = page.getByRole("dialog", { name: "File shelf", exact: true });
  await expect(dialog.getByRole("button", { name: "Add files" })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event("pinwall-e2e:shelf-drop")));
  await expect(dialog.getByRole("listitem")).toContainText("Dropped fixture.txt");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:shelf:entries", "[]"));
  await page.evaluate(() => window.dispatchEvent(new Event("pinwall-e2e:shelf-drop")));
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:shelf:entries"))).toBe("[]");
});

test("closing shelf during a pending chooser discards late selection", async ({ page }) => {
  const { widget } = await enable(page, "file-shelf", "Open shelf");
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:shelf:delay", "true"));
  await widget.getByRole("button", { name: "Open shelf" }).click();
  const dialog = page.getByRole("dialog", { name: "File shelf", exact: true });
  await dialog.getByRole("button", { name: "Add files" }).click();
  await expect(dialog.getByRole("button", { name: "Add files" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pinwall-e2e:shelf:entries") ?? "[]"))).toEqual([]);
});

test("shelf corruption reset requires confirmation and a future schema cannot be overwritten", async ({ page }) => {
  const { widget } = await enable(page, "file-shelf", "Open shelf");
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:shelf:fail", "shelf_corrupt"));
  await widget.getByRole("button", { name: "Open shelf" }).click();
  const dialog = page.getByRole("dialog", { name: "File shelf", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("index is corrupt");
  page.once("dialog", dialog => dialog.dismiss());
  await dialog.getByRole("button", { name: "Clear references" }).click();
  await expect(dialog.getByRole("alert")).toContainText("index is corrupt");
  page.once("dialog", dialog => dialog.accept());
  await dialog.getByRole("button", { name: "Clear references" }).click();
  await expect(dialog.getByRole("status")).toContainText("References cleared");
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:shelf:fail", "shelf_future_version"));
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("newer app version");
  page.once("dialog", dialog => dialog.accept());
  await dialog.getByRole("button", { name: "Clear references" }).click();
  await expect(dialog.getByRole("alert")).toContainText("will not be overwritten");
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:shelf:fail"))).toBe("shelf_future_version");
});

test("screen capture is opt in and handles permission denial and cancel before pixel sampling and export", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const { widget } = await enable(page, "screen-tools", "Open screen tools");
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:screen:calls"))).toBeNull();
  await widget.getByRole("button", { name: "Open screen tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Screen tools", exact: true });
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:screen:calls"))).toBeNull();
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:screen:fail", "screen_permission_denied"));
  await dialog.getByRole("button", { name: "Capture screen region" }).click();
  await expect(dialog.getByRole("alert")).toContainText("System Settings");
  await page.evaluate(() => { localStorage.removeItem("pinwall-e2e:screen:fail"); localStorage.setItem("pinwall-e2e:screen:cancel", "true"); });
  await dialog.getByRole("button", { name: "Capture screen region" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Capture cancelled");
  await expect(dialog.getByRole("img")).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:screen:cancel"));
  await dialog.getByRole("button", { name: "Capture screen region" }).click();
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByLabel("X coordinate (pixels)").fill("799");
  await dialog.getByLabel("Y coordinate (pixels)").fill("399");
  await dialog.getByRole("button", { name: "Read pixel color" }).click();
  await expect(dialog.getByLabel("Pixel color")).toContainText("#0C2238");
  await dialog.getByRole("button", { name: "Copy color value" }).click();
  await expect(dialog.getByRole("status", { name: "", exact: true })).toHaveText("Color value copied");
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:clipboard:lastwrite"))).toBe("#0C2238");
  await dialog.getByRole("button", { name: "Captured region preview; activate to pick a color" }).click({ position: { x: 1, y: 1 } });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pinwall-e2e:screen:pixel") ?? "{}").x)).toBeLessThan(5);
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:screen:fail", "tool_io_failed"));
  await dialog.getByRole("button", { name: "Export capture PNG" }).click();
  await expect(dialog.getByRole("alert")).toContainText("File operation did not complete");
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:screen:fail"));
  await dialog.getByRole("button", { name: "Export capture PNG" }).click();
  await expect(dialog.getByRole("status", { name: "", exact: true })).toContainText("Exported");
  await page.screenshot({ path: "/tmp/pinwall-screen-narrow.png", fullPage: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pinwall-e2e:screen:token"))).toBeNull();
});

test("screen OCR requires review and confirmation then persists one edited note", async ({ page }) => {
  const { widget } = await enable(page, "screen-tools", "Open screen tools");
  await widget.getByRole("button", { name: "Open screen tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Screen tools", exact: true });
  await dialog.getByRole("button", { name: "Capture screen region" }).click();
  await dialog.getByRole("button", { name: "Recognize and review note" }).click();
  const preview = page.getByRole("dialog", { name: "Image to note" });
  await expect(preview.getByLabel("Note text")).toHaveValue("Screen fixture\n屏幕文字");
  await expect(page.locator(".pin-card").filter({ hasText: "Screen fixture" })).toHaveCount(0);
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Recognize and review note" }).click();
  await preview.getByLabel("Note title").fill("Screen reviewed note");
  await preview.getByLabel("Note text").fill("Reviewed screen text\n审核后的文字");
  await preview.getByRole("button", { name: "Create note" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.locator(".pin-card").filter({ hasText: "Screen reviewed note" }).locator(".card-body")).toHaveText("Reviewed screen text\n审核后的文字");
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:screen:token"))).toBeNull();
});

test("closing a pending capture cancels it and discards the late image", async ({ page }) => {
  const { widget } = await enable(page, "screen-tools", "Open screen tools");
  await page.evaluate(() => localStorage.setItem("pinwall-e2e:screen:delay", "true"));
  await widget.getByRole("button", { name: "Open screen tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Screen tools", exact: true });
  await dialog.getByRole("button", { name: "Capture screen region" }).click();
  await expect(dialog.getByRole("button", { name: "Selecting / capturing…" })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => localStorage.getItem("pinwall-e2e:screen:token"))).toBeNull();
  await page.evaluate(() => localStorage.removeItem("pinwall-e2e:screen:delay"));
  await widget.getByRole("button", { name: "Open screen tools" }).click();
  await expect(dialog.getByRole("img")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Capture screen region" }).click();
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
});
