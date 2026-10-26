import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures/tauri';
import type { Page } from '@playwright/test';

const manifest = JSON.parse(readFileSync('resources/widgets/widget-system-monitor/widget.json', 'utf8'));
const html = readFileSync('resources/widgets/widget-system-monitor/index.html', 'utf8');
const selector = `iframe[title="${manifest.name}"]`;

async function installAndEnable(page: Page) {
  await page.addInitScript(pkg => {
    if (window === window.top && location.origin === 'http://localhost:1932') localStorage.setItem('pinwall-e2e:widgets:package', JSON.stringify(pkg));
  }, { manifest, html });
  await page.goto('/?window=settings');
  await page.getByRole('button', { name: /^Experimental/ }).click();
  const catalog = page.locator('.ap-widget-catalog-card').filter({ hasText: manifest.name });
  page.once('dialog', dialog => dialog.accept());
  await catalog.getByRole('button', { name: 'Install', exact: true }).click();
  const toggle = page.locator('.ap-widget-installed-row').getByRole('checkbox');
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:metrics:calls'))).toBeNull();
  await toggle.check();
  await page.goto('/');
}

test('monitor shows actual fields, independent failure states and a retryable native failure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await installAndEnable(page);
  const frame = page.frameLocator(selector);
  await expect(frame.locator('#cpu-value')).toHaveText('37.5%');
  await expect(frame.locator('#memory-value')).toHaveText('8.0 GiB / 16.0 GiB');
  await expect(frame.locator('#battery-value')).toHaveText('85%');
  await expect(frame.locator('#battery-detail')).toHaveText('Connected to power');
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:metrics:partial', 'true'));
  await frame.getByRole('button', { name: 'Refresh' }).click();
  await expect(frame.locator('#cpu-value')).toHaveText('Unavailable');
  await expect(frame.locator('#memory-value')).toHaveText('8.0 GiB / 16.0 GiB');
  await expect(frame.locator('#battery-value')).toHaveText('No battery');
  await page.screenshot({ path: '/tmp/pinwall-metrics-narrow.png', fullPage: true });
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:metrics:fail', 'true'));
  await frame.getByRole('button', { name: 'Refresh' }).click();
  await expect(frame.getByRole('alert')).toHaveText('Could not read system status. Try again.');
  await page.evaluate(() => {
    localStorage.removeItem('pinwall-e2e:metrics:fail');
    localStorage.removeItem('pinwall-e2e:metrics:partial');
  });
  await frame.getByRole('button', { name: 'Refresh' }).click();
  await expect(frame.locator('#cpu-value')).toHaveText('37.5%');
  await expect(frame.getByRole('alert')).toBeEmpty();
});

test('hiding and disabling stops polling; resuming reads again', async ({ page }) => {
  await installAndEnable(page);
  await expect(page.frameLocator(selector).locator('#cpu-value')).toHaveText('37.5%');
  const embedded = page.frames().find(frame => frame.parentFrame() !== null)!;
  await embedded.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const calls = await page.evaluate(() => localStorage.getItem('pinwall-e2e:metrics:calls'));
  await page.waitForTimeout(3300);
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:metrics:calls'))).toBe(calls);
  await embedded.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('pinwall-e2e:metrics:calls')))).toBeGreaterThan(Number(calls));
  await page.locator('.widget-frame').click({ button: 'right', position: { x: 0, y: 0 } });
  await page.getByRole('button', { name: 'Disable widget', exact: true }).click();
  await expect(page.locator(selector)).toHaveCount(0);
  const stopped = await page.evaluate(() => localStorage.getItem('pinwall-e2e:metrics:calls'));
  await page.waitForTimeout(3300);
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:metrics:calls'))).toBe(stopped);
});
