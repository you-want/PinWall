import { test, expect } from './fixtures/tauri';
import packageInfo from '../package.json' with { type: 'json' };

test('beta settings show the version and manual download instructions', async ({ page }) => {
  await page.goto('/?window=settings');
  await expect(page.getByText(`Current Version: v${packageInfo.version}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/This beta uses manual downloads/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for Updates', exact: true })).toHaveCount(0);
});

test('a failed note save retains the draft and retries without overwriting saved data', async ({ page }) => {
  await page.goto('/');
  await page.locator('.floating-add-btn').click();
  await page.getByLabel('Title', { exact: true }).fill('Durable note');
  await page.getByLabel('Content', { exact: true }).fill('Saved body');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const card = page.locator('.pin-card').filter({ hasText: 'Durable note' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pinwall-e2e:store:cards'))).toContain('Saved body');
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:cards-fail', 'true'));
  await card.getByRole('button', { name: 'Edit Note: Durable note' }).click();
  await page.getByLabel('Content', { exact: true }).fill('Unsaved draft');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unsaved changes');
  await expect(card).toContainText('Unsaved draft');
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:store:cards'))).toContain('Saved body');
  await page.evaluate(() => localStorage.removeItem('pinwall-e2e:cards-fail'));
  await page.getByRole('button', { name: 'Retry saving' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(card).toContainText('Unsaved draft');
});

test('restoring from the settings window synchronizes an open wall', async ({ page }) => {
  await page.goto('/');
  await page.locator('.floating-add-btn').click();
  await page.getByLabel('Title', { exact: true }).fill('Existing note');
  await page.getByLabel('Content', { exact: true }).fill('Existing body');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pinwall-e2e:store:cards'))).toContain('Existing body');
  const settings = await page.context().newPage();
  await settings.goto('/?window=settings');
  await settings.getByRole('button', { name: 'Export notes', exact: true }).click();
  await expect(settings.getByRole('status')).toContainText('backup saved');
  await settings.evaluate(() => {
    const key = 'pinwall-e2e:backup:notes';
    const data = JSON.parse(localStorage.getItem(key)!) as { cards: Record<string, unknown>[] };
    const original = data.cards.find(card => card.title === 'Existing note')!;
    data.cards.push({ ...original, id: 'cross-window-note', title: 'From backup', content: 'Visible in the wall' });
    localStorage.setItem(key, JSON.stringify(data));
  });
  settings.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'Restore notes', exact: true }).click();
  await expect(page.locator('[data-card-id="cross-window-note"]')).toContainText('Visible in the wall');
  await settings.close();
});

test('legacy API keys migrate out of settings JSON and remain available in settings', async ({ page }) => {
  await page.goto('/?window=settings');
  await expect(page.getByRole('button', { name: 'Export notes', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const key = 'pinwall-e2e:file:pinwall-settings.json';
    const data = JSON.parse(localStorage.getItem(key)!) as Record<string, unknown>;
    data.ai = { enabled: true, apiEndpoint: 'https://example.invalid', model: 'example', apiKey: 'fake-migration-key' };
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: /Experimental AI, quota, widgets/ }).click();
  await expect(page.locator('input[type="password"]').first()).toHaveValue('fake-migration-key');
  const persisted = await page.evaluate(() => localStorage.getItem('pinwall-e2e:file:pinwall-settings.json')!);
  expect(persisted).not.toContain('fake-migration-key');
  expect(JSON.parse(persisted)).toMatchObject({ schemaVersion: 2, ai: { apiKey: '' } });
  await page.reload();
  await page.getByRole('button', { name: /Experimental AI, quota, widgets/ }).click();
  await expect(page.locator('input[type="password"]').first()).toHaveValue('fake-migration-key');
});

test('denied credential access preserves legacy settings and shows recovery guidance', async ({ page }) => {
  await page.goto('/?window=settings');
  await expect(page.getByRole('button', { name: 'Export notes', exact: true })).toBeVisible();
  const before = await page.evaluate(() => {
    const key = 'pinwall-e2e:file:pinwall-settings.json';
    const data = JSON.parse(localStorage.getItem(key)!) as Record<string, unknown>;
    data.ai = { enabled: false, apiEndpoint: 'https://example.invalid', model: 'example', apiKey: 'fake-retained-key' };
    const bytes = JSON.stringify(data);
    localStorage.setItem(key, bytes);
    localStorage.setItem('pinwall-e2e:credentials-fail', 'true');
    return bytes;
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Unlock the macOS login keychain');
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:file:pinwall-settings.json'))).toBe(before);
  await page.evaluate(() => localStorage.removeItem('pinwall-e2e:credentials-fail'));
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export notes', exact: true })).toBeVisible();
});
