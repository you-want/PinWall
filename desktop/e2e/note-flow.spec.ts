import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/tauri';

async function createNote(page: Page, title: string, content: string) {
  await page.locator('.floating-add-btn').click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Content', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

function note(page: Page, title: string) {
  return page.locator('.pin-card').filter({ has: page.getByText(title, { exact: true }) });
}

test('two notes preserve edited content, color and custom positions after reload', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'First note', 'Original body');
  await createNote(page, 'Second note', 'Keep this body');
  const id = await note(page, 'First note').getAttribute('data-card-id');
  const secondId = await note(page, 'Second note').getAttribute('data-card-id');
  // Existing optional hooks may also create a hydration card; track the user's notes.
  const userNotes = page.locator(`[data-card-id="${id}"], [data-card-id="${secondId}"]`);
  await note(page, 'First note').getByRole('button', { name: 'Edit Note: First note' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Note' });
  await editor.getByLabel('Title', { exact: true }).fill('Edited note');
  await editor.getByLabel('Content', { exact: true }).fill('Edited body\nSecond line');
  await editor.getByRole('button', { name: 'Color 4', exact: true }).click();
  await editor.getByLabel('Content', { exact: true }).press('Control+Enter');
  await expect(editor).toHaveCount(0);
  const edited = note(page, 'Edited note');
  await expect(edited).toHaveAttribute('data-card-id', id!);
  await expect(edited.locator('.card-body')).toHaveText('Edited body\nSecond line');
  const color = await edited.evaluate((element) => getComputedStyle(element).backgroundImage);
  const header = await edited.locator('.card-title').boundingBox();
  expect(header).not.toBeNull();
  await page.mouse.move(header!.x + 30, header!.y + 8);
  await page.mouse.down();
  await page.mouse.move(header!.x + 140, header!.y + 288, { steps: 12 });
  await page.mouse.up();
  const positions = await userNotes.evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute('data-card-id'),
    x: (element as HTMLElement).style.left,
    y: (element as HTMLElement).style.top,
  })).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')));
  expect(positions.find((position) => position.id === id)?.y).not.toBe('40px');

  await page.reload();
  await expect(userNotes).toHaveCount(2);
  await expect(note(page, 'Edited note').locator('.card-body')).toHaveText('Edited body\nSecond line');
  await expect(note(page, 'Second note').locator('.card-body')).toHaveText('Keep this body');
  expect(await note(page, 'Edited note').evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(color);
  const restored = await userNotes.evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute('data-card-id'),
    x: (element as HTMLElement).style.left,
    y: (element as HTMLElement).style.top,
  })).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')));
  expect(restored).toEqual(positions);
});

test('cancel and Escape discard drafts and restore keyboard focus', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'Keep me', 'Saved body');
  const card = note(page, 'Keep me');
  const edit = card.getByRole('button', { name: 'Edit Note: Keep me' });
  await edit.click();
  await page.getByLabel('Content', { exact: true }).fill('Unsaved body');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.locator('.card-body')).toHaveText('Saved body');
  await expect(edit).toBeFocused();
  await edit.click();
  await page.getByLabel('Title', { exact: true }).fill('Unsaved title');
  await page.getByLabel('Title', { exact: true }).press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(edit).toBeFocused();
  await page.reload();
  await expect(note(page, 'Keep me').locator('.card-body')).toHaveText('Saved body');
});

test('reminder editor restores time, rejects invalid changes and persists disabling', async ({ page }) => {
  await page.goto('/');
  await page.locator('.floating-add-btn').click();
  await page.getByRole('button', { name: 'One-time Reminder', exact: false }).click();
  await page.getByLabel('Title', { exact: true }).fill('Appointment');
  await page.getByLabel('Content', { exact: true }).fill('Bring documents');
  await page.getByLabel('Reminder date', { exact: true }).fill('2099-10-16');
  await page.getByLabel('Reminder Time', { exact: true }).fill('15:30');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const card = note(page, 'Appointment');
  await card.getByRole('button', { name: 'Edit Note: Appointment' }).click();
  await expect(page.getByLabel('Reminder date', { exact: true })).toHaveValue('2099-10-16');
  await expect(page.getByLabel('Reminder Time', { exact: true })).toHaveValue('15:30');
  await page.getByLabel('Reminder date', { exact: true }).fill('2000-01-01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose a valid future reminder time');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Reminder date', { exact: true }).fill('2099-10-17');
  await page.getByLabel('Reminder Time', { exact: true }).fill('16:45');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await card.getByRole('button', { name: 'Edit Note: Appointment' }).click();
  await expect(page.getByLabel('Reminder date', { exact: true })).toHaveValue('2099-10-17');
  await expect(page.getByLabel('Reminder Time', { exact: true })).toHaveValue('16:45');
  await page.getByLabel('Enable reminder', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await card.getByRole('button', { name: 'Edit Note: Appointment' }).click();
  await expect(page.getByLabel('Enable reminder', { exact: true })).not.toBeChecked();
});

test('confirmed deletion stays deleted after reload', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'Delete me', 'Disposable');
  page.once('dialog', (dialog) => dialog.accept());
  await note(page, 'Delete me').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(note(page, 'Delete me')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.floating-add-btn')).toBeVisible();
  await expect(note(page, 'Delete me')).toHaveCount(0);
});

test('arrangement remains an explicit action and works after custom dragging', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'Arrange me', 'Move and arrange');
  const card = note(page, 'Arrange me');
  const header = await card.locator('.card-title').boundingBox();
  await page.mouse.move(header!.x + 20, header!.y + 8);
  await page.mouse.down();
  await page.mouse.move(header!.x + 120, header!.y + 208, { steps: 8 });
  await page.mouse.up();
  await expect(card).not.toHaveCSS('top', '40px');
  await page.locator('.floating-arrange-btn').click();
  await expect(card).toHaveCSS('left', '40px');
  await expect(card).toHaveCSS('top', '40px');
});

test('failed hydration shows retry without replacing saved data', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'Recover me', 'Keep this data');
  const saved = await page.evaluate(() => {
    const key = 'pinwall-e2e:store:cards';
    const data = localStorage.getItem(key);
    localStorage.setItem(key, '{broken');
    return data;
  });
  expect(saved).not.toBeNull();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Could not read local data');
  await expect(page.locator('.floating-add-btn')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pinwall-e2e:store:cards'))).toBe('{broken');
  await page.evaluate((data) => localStorage.setItem('pinwall-e2e:store:cards', data!), saved);
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(note(page, 'Recover me').locator('.card-body')).toHaveText('Keep this data');
});

test('editor stays above fullscreen notes and contains keyboard focus in a narrow window', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await createNote(page, 'Focus test', 'Edit this note');
  const card = note(page, 'Focus test');
  await card.getByRole('button', { name: 'Maximize', exact: true }).click();
  await card.getByRole('button', { name: 'Edit Note: Focus test' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Note' });
  await expect(editor.getByLabel('Title', { exact: true })).toBeFocused();
  await page.keyboard.press('Control+Shift+N');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await editor.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(editor.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
  const bounds = await editor.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
  await page.screenshot({ path: testInfo.outputPath('edit-note-narrow.png') });
  await editor.getByLabel('Content', { exact: true }).fill('Saved from fullscreen');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card.locator('.card-body')).toHaveText('Saved from fullscreen');
  await page.keyboard.press('Control+Shift+N');
  await expect(page.getByRole('dialog', { name: 'New Note' })).toBeVisible();
});
