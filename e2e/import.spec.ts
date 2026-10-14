import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { apkgPath, csvZipPath } from './fixtures/importSamples';

const OUT = process.env.E2E_ARTIFACTS ?? join(__dirname, '..', 'e2e-artifacts');
mkdirSync(OUT, { recursive: true });

async function importFile(page: Page, filePath: string) {
  await page.goto('/');
  await expect(page.getByTestId('folder-list-menu')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('folder-list-menu').click();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-import').click(),
  ]);
  await fileChooser.setFiles(filePath);
  await expect(page.getByTestId('import-preview-title')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('folder-list-menu')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/失敗 \d+枚/)).not.toBeVisible();
}

async function expectCardThumbShowsImage(page: Page) {
  const thumb = page.getByTestId('card-thumb').first();
  await expect(thumb).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const canvas = thumb.locator('canvas');
        if (!(await canvas.count())) return false;
        const box = await canvas.first().boundingBox();
        return (box?.width ?? 0) > 10;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

test.afterEach(async ({ page }, info) => {
  const video = page.video();
  await page.close();
  if (video) {
    const name = info.title.replace(/\W+/g, '-');
    await video.saveAs(join(OUT, `import-${name}.webm`));
  }
});

test('imports synthetic CSV zip and shows card image', async ({ page }) => {
  await importFile(page, csvZipPath);
  await page.getByTestId('folder-row-E2E').click();
  await expectCardThumbShowsImage(page);
});

test('imports synthetic apkg and shows card image', async ({ page }) => {
  await importFile(page, apkgPath);
  await page.getByTestId('folder-row-子').click();
  await expectCardThumbShowsImage(page);
});
