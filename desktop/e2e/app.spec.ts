import { test, expect } from '@playwright/test';

test.describe('PinWall E2E Tests', () => {
  test('page loads', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await expect(page.locator('.app-container')).toBeVisible();
  });

  test('renders wall content after startup', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await expect(page.locator('.loading')).not.toBeVisible();
    await expect(page.locator('.empty-hint, .pin-card, .wall-side-panel').first()).toBeVisible();
  });

  test('floating buttons are visible', async ({ page }) => {
    await page.goto('http://localhost:1930');
    const floatingButtons = page.locator('.floating-buttons');
    await expect(floatingButtons).toBeVisible();
  });

  test('new card modal opens when clicking + button', async ({ page }) => {
    await page.goto('http://localhost:1930');
    const addButton = page.locator('.floating-add-btn');
    await addButton.click();
    await expect(page.locator('.modal-overlay-v2')).toBeVisible();
  });

  test('new card modal has title and content inputs', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const titleInput = page.locator('#card-title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue(/^(新建便签|New Note)$/);

    const contentTextarea = page.locator('#card-content');
    await expect(contentTextarea).toBeVisible();
  });

  test('new card modal has color dots', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const colorDots = page.locator('.color-dot-v2');
    await expect(colorDots).toHaveCount(8);
  });

  test('new card modal has create and cancel buttons', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const createBtn = page.locator('.btn-v2-primary');
    await expect(createBtn).toBeVisible();

    const cancelBtn = page.locator('.btn-v2-cancel');
    await expect(cancelBtn).toBeVisible();
  });

  test('cancel button closes modal', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();
    await expect(page.locator('.modal-overlay-v2')).toBeVisible();

    await page.locator('.btn-v2-cancel').click();
    await expect(page.locator('.modal-overlay-v2')).not.toBeVisible();
  });

  test('modal closes when clicking overlay', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();
    await expect(page.locator('.modal-overlay-v2')).toBeVisible();

    await page.locator('.modal-overlay-v2').click({ position: { x: 0, y: 0 } });
    await expect(page.locator('.modal-overlay-v2')).not.toBeVisible();
  });

  test('can type in title input', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const titleInput = page.locator('#card-title');
    await titleInput.clear();
    await titleInput.fill('My Test Note');
    await expect(titleInput).toHaveValue('My Test Note');
  });

  test('can type in content textarea', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const contentTextarea = page.locator('#card-content');
    await contentTextarea.fill('This is a test content');
    await expect(contentTextarea).toHaveValue('This is a test content');
  });

  test('color dot selection works', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const colorDots = page.locator('.color-dot-v2');
    await colorDots.first().click();
    await expect(colorDots.first()).toHaveClass(/active/);
  });

  test('card type tabs are visible', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const typeTabs = page.locator('.type-tab');
    await expect(typeTabs).toHaveCount(4);
  });

  test('create button is visible and enabled', async ({ page }) => {
    await page.goto('http://localhost:1930');
    await page.locator('.floating-add-btn').click();

    const createBtn = page.locator('.btn-v2-primary');
    await expect(createBtn).toBeVisible();
    await expect(createBtn).not.toBeDisabled();
  });
});
