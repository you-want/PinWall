import { test, expect } from './fixtures/tauri';

test('export and merge restore preserve local notes and disable imported reminders', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('.floating-add-btn').click();
  await page.getByLabel('Title', { exact: true }).fill('Portable note');
  await page.getByLabel('Content', { exact: true }).fill('Keep body and position');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/?window=settings');
  await page.getByRole('button', { name: 'Export notes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Note backup saved');
  const exported = await page.evaluate(() => JSON.parse(localStorage.getItem('pinwall-e2e:backup:notes')!) as { cards: Record<string, unknown>[] });
  expect(exported).not.toHaveProperty('ai');
  const saved = exported.cards.find(card => card.title === 'Portable note');
  expect(saved).toMatchObject({ content: 'Keep body and position' });
  await page.evaluate(() => {
    const key = 'pinwall-e2e:backup:notes';
    const backup = JSON.parse(localStorage.getItem(key)!) as { cards: Record<string, unknown>[] };
    const note = backup.cards.find(card => card.title === 'Portable note')!;
    note.content = 'Older conflicting body';
    backup.cards.push({ ...note, id: 'imported-reminder', title: 'Imported appointment', reminderEnabled: true, reminderTime: Date.now() + 86_400_000, cardType: 'reminder' });
    localStorage.setItem(key, JSON.stringify(backup));
  });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Restore notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore notes', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:store:cards')!)).not.toContain('imported-reminder');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Restore notes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Restored 1 notes');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pinwall-e2e:store:cards')!) as { cards: Record<string, unknown>[] });
  expect(state.cards.find(card => card.id === 'imported-reminder')).toMatchObject({ reminderEnabled: false, reminderFired: true });
  expect(state.cards.find(card => card.title === 'Portable note')).toMatchObject({ content: 'Keep body and position', x: saved!.x, y: saved!.y });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Restore notes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Restored 0 notes');
  await page.setViewportSize({ width: 390, height: 700 });
  await page.getByRole('button', { name: 'Export notes', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('note-backup-narrow.png') });
  await page.goto('/');
  await expect(page.locator('[data-card-id="imported-reminder"]')).toContainText('Older conflicting body');
});

test('invalid backups fail visibly and leave local data intact', async ({ page }) => {
  await page.goto('/?window=settings');
  const before = await page.evaluate(() => {
    localStorage.setItem('pinwall-e2e:backup:notes', '{broken');
    return localStorage.getItem('pinwall-e2e:store:cards');
  });
  await page.getByRole('button', { name: 'Restore notes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Backup failed');
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:store:cards'))).toBe(before);
});

test('corrupt settings stop startup and preserve a backup; future schema stays untouched', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.floating-add-btn')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:file:pinwall-settings.json', '{broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Corrupt files are preserved');
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:file:pinwall-settings.json.corrupt-backup'))).toBe('{broken');
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:file:pinwall-settings.json', '{"schemaVersion":99}'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('newer PinWall');
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:file:pinwall-settings.json'))).toBe('{"schemaVersion":99}');
});

test('settings save failures stay visible without replacing stored preferences', async ({ page }) => {
  await page.goto('/?window=settings');
  await expect(page.getByRole('button', { name: 'Export notes', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('pinwall-e2e:file:pinwall-settings.json', '{"schemaVersion":99}'));
  const startup = page.getByRole('checkbox', { name: 'Launch PinWall when the system starts' });
  await startup.click();
  await expect(page.getByRole('alert')).toContainText('Could not read or save settings');
  await expect(startup).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:file:pinwall-settings.json'))).toBe('{"schemaVersion":99}');
});
