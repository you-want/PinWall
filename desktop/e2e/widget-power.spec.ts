import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures/tauri';
import type { Page } from '@playwright/test';

const manifest = JSON.parse(readFileSync('resources/widgets/widget-keep-awake/widget.json', 'utf8'));
const html = readFileSync('resources/widgets/widget-keep-awake/index.html', 'utf8');
const selector = 'iframe[title="防休眠 / Keep Awake"]';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(pkg => {
    if (window === window.top && location.origin === 'http://localhost:1932' && !localStorage.getItem('pinwall-e2e:widgets:package')) localStorage.setItem('pinwall-e2e:widgets:package', JSON.stringify(pkg));
  }, { manifest, html });
});

async function installAndEnable(page: Page) {
  await page.goto('/?window=settings');
  await page.getByRole('button', { name: /^Experimental/ }).click();
  const catalog = page.locator('.ap-widget-catalog-card').filter({ hasText: manifest.name });
  page.once('dialog', dialog => dialog.accept());
  await catalog.getByRole('button', { name: 'Install', exact: true }).click();
  const row = page.locator('.ap-widget-installed-row').filter({ hasText: manifest.name });
  await expect(row.getByRole('checkbox')).not.toBeChecked();
  await row.getByRole('checkbox').check();
  await page.goto('/');
  await expect(page.frameLocator(selector).getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
}

async function menu(page: Page, name: string) {
  await page.locator('.widget-frame').click({ button: 'right', position: { x: 0, y: 0 } });
  await page.getByRole('button', { name, exact: true }).click();
}

test('official power plugin is opt-in, isolated, and releases on refresh, disable and uninstall', async ({ page }) => {
  await installAndEnable(page);
  const frame = page.frameLocator(selector);
  await expect(frame.getByRole('status')).toHaveText('Not running');
  await expect(page.locator(selector)).toHaveAttribute('sandbox', 'allow-scripts');
  const embedded = page.frames().find(item => item.parentFrame() !== null)!;
  expect(await embedded.evaluate(() => {
    try { void parent.document.body; return false; } catch { return true; }
  })).toBe(true);
  expect(await embedded.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(false);

  await frame.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await frame.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(frame.getByRole('status')).toHaveText('Not running');
  await frame.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await menu(page, 'Refresh');
  await expect(frame.getByRole('status')).toHaveText('Not running');
  await frame.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:power:failStop', 'true'));
  await menu(page, 'Disable widget');
  await expect(page.getByText('Keep Awake could not stop. The widget remains enabled; retry disabling it.')).toBeVisible();
  await expect(page.locator(selector)).toHaveCount(1);
  await page.evaluate(() => localStorage.removeItem('pinwall-e2e:power:failStop'));
  await menu(page, 'Disable widget');
  await expect(page.locator(selector)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pinwall-e2e:power:log') ?? '[]').at(-1))).toBe('close');

  await page.goto('/?window=settings');
  await page.getByRole('button', { name: /^Experimental/ }).click();
  const row = page.locator('.ap-widget-installed-row').filter({ hasText: manifest.name });
  await expect(row.getByRole('checkbox')).not.toBeChecked();
  await row.getByRole('checkbox').check();
  await page.goto('/');
  await expect(frame.getByRole('status')).toHaveText('Not running');
  await menu(page, 'Remove widget');
  await expect(page.locator(selector)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.app-container')).toBeVisible();
  await expect(page.locator(selector)).toHaveCount(0);
});

test('power failures are readable and retryable in a narrow wall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await installAndEnable(page);
  const frame = page.frameLocator(selector);
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:power:failStart', 'true'));
  await frame.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(frame.getByRole('alert')).toHaveText('Could not update Keep Awake. Try again.');
  await expect(frame.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  await page.evaluate(() => localStorage.removeItem('pinwall-e2e:power:failStart'));
  await frame.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await expect(frame.getByRole('alert')).toBeEmpty();
  await page.screenshot({ path: '/tmp/pinwall-plugin-power-narrow.png', fullPage: true });
  await frame.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('existing clock scripts still render in the opaque sandbox', async ({ page }) => {
  const clockManifest = JSON.parse(readFileSync('../widgets/widget-clock/widget.json', 'utf8'));
  const clockHtml = readFileSync('../widgets/widget-clock/index.html', 'utf8');
  await page.goto('/?window=settings');
  await page.evaluate(pkg => localStorage.setItem('pinwall-e2e:widgets:package', JSON.stringify(pkg)), { manifest: clockManifest, html: clockHtml });
  await page.getByRole('button', { name: /^Experimental/ }).click();
  await page.locator('.ap-widget-catalog-card').filter({ hasText: clockManifest.name }).getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.locator('.ap-widget-installed-row').getByRole('checkbox')).toBeChecked();
  await page.goto('/');
  const clock = page.frameLocator(`iframe[title="${clockManifest.name}"]`);
  await expect(clock.locator('.analog-clock .hand')).toHaveCount(3);
});
