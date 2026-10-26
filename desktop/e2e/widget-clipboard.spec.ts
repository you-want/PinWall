import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures/tauri';
import type { Page } from '@playwright/test';

const manifest = JSON.parse(readFileSync('resources/widgets/widget-clipboard-note/widget.json', 'utf8'));
const html = readFileSync('resources/widgets/widget-clipboard-note/index.html', 'utf8');
const selector = `iframe[title="${manifest.name}"]`;

async function installAndEnable(page: Page) {
  await page.addInitScript(pkg => {
    if (window === window.top && location.origin === 'http://localhost:1932') localStorage.setItem('pinwall-e2e:widgets:package', JSON.stringify(pkg));
  }, { manifest, html });
  await page.goto('/?window=settings');
  await page.getByRole('button', { name: /^Experimental/ }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.ap-widget-catalog-card').filter({ hasText: manifest.name }).getByRole('button', { name: 'Install', exact: true }).click();
  const toggle = page.locator('.ap-widget-installed-row').getByRole('checkbox');
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:clipboard:reads'))).toBeNull();
  await toggle.check(); await page.goto('/');
  await expect(page.frameLocator(selector).getByRole('button', { name: 'Open import' })).toBeEnabled();
}

test('host confirmation, preview, creation and reload work without exposing clipboard text to the widget', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await installAndEnable(page);
  const widget = page.frameLocator(selector);
  const embedded = page.frames().find(frame => frame.parentFrame() !== null)!;
  await embedded.evaluate(() => {
    addEventListener('message', event => { if (event.data?.type === 'response') document.body.dataset.lastResponse = JSON.stringify(event.data); });
  });
  await widget.getByRole('button', { name: 'Open import' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clipboard to note' });
  await expect(dialog).toBeVisible();
  await page.locator('.modal-overlay-v2').click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:background:calls'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:clipboard:reads'))).toBeNull();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:clipboard:reads'))).toBeNull();
  await widget.getByRole('button', { name: 'Open import' }).click();
  await dialog.getByRole('button', { name: 'Read text once' }).click();
  await expect(dialog.getByLabel('Note text')).toHaveValue('Clipboard fixture\nSecond line');
  await expect(dialog.getByLabel('Note title')).toBeFocused();
  await dialog.getByLabel('Note title').fill('Imported clipboard');
  await dialog.getByRole('button', { name: 'Create note' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Note title')).toBeFocused();
  await page.screenshot({ path: '/tmp/pinwall-clipboard-narrow.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Create note' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(widget.getByRole('status')).toHaveText('Note created');
  const response = await embedded.evaluate(() => document.body.dataset.lastResponse);
  expect(JSON.parse(response!).data).toEqual({ created: true, cardId: expect.any(String) });
  expect(response).not.toContain('Clipboard fixture');
  const note = page.locator('.pin-card').filter({ hasText: 'Imported clipboard' });
  await expect(note).toHaveCount(1);
  await expect(note.locator('.card-body')).toHaveText('Clipboard fixture\nSecond line');
  await page.reload();
  await expect(note).toHaveCount(1);
  await expect(note.locator('.card-body')).toHaveText('Clipboard fixture\nSecond line');
});

test('read rejection and failed save are retryable without duplicate notes', async ({ page }) => {
  await installAndEnable(page);
  await page.frameLocator(selector).getByRole('button', { name: 'Open import' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clipboard to note' });
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:clipboard:fail', 'clipboard_sensitive'));
  await dialog.getByRole('button', { name: 'Read text once' }).click();
  await expect(dialog.getByRole('alert')).toContainText('marked as private');
  await page.evaluate(() => {
    localStorage.removeItem('pinwall-e2e:clipboard:fail');
    localStorage.setItem('pinwall-e2e:cards-fail', 'true');
  });
  await dialog.getByRole('button', { name: 'Read text once' }).click();
  await expect(dialog.getByLabel('Note text')).toHaveValue('Clipboard fixture\nSecond line');
  await dialog.getByLabel('Note title').fill('Retry clipboard');
  await dialog.getByRole('button', { name: 'Create note' }).click();
  await expect(dialog.getByRole('alert')).toContainText('unsaved draft');
  await page.evaluate(() => localStorage.removeItem('pinwall-e2e:cards-fail'));
  await dialog.getByRole('button', { name: 'Retry saving' }).click();
  await expect(dialog).toHaveCount(0);
  const note = page.locator('.pin-card').filter({ hasText: 'Retry clipboard' });
  await expect(note).toHaveCount(1);
  await page.reload();
  await expect(note).toHaveCount(1);
});

test('Escape cancels a pending read and a late response cannot create a note', async ({ page }) => {
  await installAndEnable(page);
  const widget = page.frameLocator(selector);
  await widget.getByRole('button', { name: 'Open import' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clipboard to note' });
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:clipboard:delay', 'true'));
  await dialog.getByRole('button', { name: 'Read text once' }).click();
  await expect(dialog.getByRole('button', { name: 'Reading…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(widget.getByRole('status')).toHaveText('Import cancelled');
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('pinwall-e2e:store:cards') ?? '{"cards":[]}').cards as { content: string }[]).some(card => card.content === 'Clipboard fixture\nSecond line'))).toBe(false);
  await expect(page.locator(selector)).toBeFocused();
});
