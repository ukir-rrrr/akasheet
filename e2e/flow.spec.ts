import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Main flow on Expo web. The camera cannot run here, so the card image comes from the bundled sample
 * textbook page (the "サンプルの教科書ページで試す" entry, the same source the native empty state offers).
 */

const OUT = process.env.E2E_ARTIFACTS ?? join(__dirname, '..', 'e2e-artifacts');
mkdirSync(OUT, { recursive: true });

function stepper(page: Page, prefix: string) {
  let n = 0;
  return async (name: string) => {
    n += 1;
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(OUT, `${prefix}-${String(n).padStart(2, '0')}-${name}.png`) });
  };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.getByTestId('editor-canvas').boundingBox();
  if (!box) throw new Error('editor canvas not laid out');
  const steps = 24;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(box.x + from[0] + (to[0] - from[0]) * t, box.y + from[1] + (to[1] - from[1]) * t);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

async function createFolder(page: Page, name: string) {
  await page.getByTestId('create-first-folder').click();
  await page.getByTestId('prompt-input').fill(name);
  await page.getByTestId('prompt-confirm').click();
  await expect(page.getByTestId(`folder-row-${name}`)).toBeVisible();
}

async function createSampleCard(page: Page, folder: string, shot?: (name: string) => Promise<void>) {
  await page.getByTestId(`folder-row-${folder}`).click();
  await page.getByTestId('folder-try-sample').click();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByTestId('mask-count')).toHaveText('マスク 0');
  await page.waitForTimeout(1500);
  await shot?.('editor-opened');

  await drag(page, [80, 150], [225, 150]);
  await expect(page.getByTestId('mask-count')).toHaveText('マスク 1');
  await shot?.('marker-1');
  await drag(page, [95, 250], [265, 250]);
  await expect(page.getByTestId('mask-count')).toHaveText('マスク 2');
  await shot?.('marker-2');
  await page.getByTestId('tool-rect').click();
  await drag(page, [200, 378], [322, 440]);
  await expect(page.getByTestId('mask-count')).toHaveText('マスク 3');
  await shot?.('rectangle');

  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('card-thumb')).toHaveCount(1);
  await expect(page.getByTestId('toast')).toContainText(`「${folder}」に保存しました`);
  await shot?.('saved');
}

test.afterEach(async ({ page }, info) => {
  const video = page.video();
  await page.close();
  if (video) await video.saveAs(join(OUT, `${info.title.replace(/\W+/g, '-')}.webm`));
});

test('create a folder and a masked card, then review it', async ({ page }) => {
  const shot = stepper(page, 'flow');
  await page.goto('/');
  await expect(page.getByTestId('create-first-folder')).toBeVisible({ timeout: 90_000 });
  await shot('empty-state');

  await createFolder(page, '日本史');
  await shot('folder-created');
  await createSampleCard(page, '日本史', shot);

  await page.getByTestId('start-review').click();
  await expect(page.getByTestId('review-progress')).toHaveText('1 / 1');
  await expect(page.getByTestId('mask-number-1')).toBeVisible();
  await page.waitForTimeout(800);
  await shot('review-start');

  for (const left of [2, 1]) {
    await page.getByTestId('reveal-next').click();
    await expect(page.getByTestId('remaining')).toContainText(`残り ${left} / 3`);
    await shot(`revealed-${3 - left}`);
  }
  await page.getByTestId('reveal-next').click();
  await expect(page.getByTestId('remaining')).toHaveText('すべてめくりました');
  await shot('revealed-3');

  await page.getByTestId('answer-again').click();
  await expect(page.getByTestId('toast')).toContainText('まだ');
  await expect(page.getByTestId('review-progress')).toHaveText('2 / 2');
  await expect(page.getByTestId('remaining')).toContainText('残り 3 / 3');
  await shot('answered-again');

  for (let i = 0; i < 3; i++) await page.getByTestId('reveal-next').click();
  await expect(page.getByTestId('remaining')).toHaveText('すべてめくりました');
  await shot('revealed-again');
  await page.getByTestId('answer-good').click();
  await expect(page.getByTestId('toast')).toContainText('覚えた');
  await expect(page.getByTestId('review-wrapping-up')).toBeVisible();
  await shot('answered-good');

  await page.getByTestId('see-summary').click();
  await expect(page.getByTestId('summary-title')).toHaveText('おつかれさまでした');
  await expect(page.getByTestId('summary-remembered')).toHaveText('0');
  await expect(page.getByText('まだ 1枚')).toBeVisible();
  await expect(page.getByRole('button', { name: 'まだを もう一度' })).toBeVisible();
  await shot('summary');

  await page.getByTestId('summary-back').click();
  await expect(page.getByTestId('card-thumb')).toBeVisible();
  await shot('back-to-folder');
});

test('folder detail menu renames without hitting dev-menu gutter', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('create-first-folder')).toBeVisible({ timeout: 90_000 });
  await createFolder(page, '日本史');
  await page.getByTestId('folder-row-日本史').click();
  await expect(page.getByTestId('folder-menu')).toBeVisible();
  await page.getByTestId('folder-menu').click();
  await expect(page.getByTestId('menu-rename')).toBeVisible();
  await page.getByTestId('menu-rename').click();
  await page.getByTestId('prompt-input').fill('世界史');
  await page.getByTestId('prompt-confirm').click();
  await expect(page.getByTestId('folder-detail-title')).toHaveText('世界史');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('folder-row-世界史')).toBeVisible();
});

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('dark theme screens', async ({ page }) => {
    const shot = stepper(page, 'dark');
    await page.goto('/');
    await expect(page.getByTestId('create-first-folder')).toBeVisible({ timeout: 90_000 });
    await shot('empty-state');
    await createFolder(page, '英単語');
    await createSampleCard(page, '英単語');
    await page.getByTestId('back').click();
    await expect(page.getByTestId('folder-row-英単語')).toBeVisible();
    await shot('folder-list');
    await page.getByTestId('folder-row-英単語').click();
    await page.getByTestId('start-review').click();
    await expect(page.getByTestId('mask-number-1')).toBeVisible();
    await page.getByTestId('reveal-next').click();
    await shot('review');
  });
});
