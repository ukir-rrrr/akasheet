import { defineConfig } from '@playwright/test';

const PORT = 8765;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    video: { mode: 'on', size: { width: 390, height: 844 } },
    actionTimeout: 15_000,
  },
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 240_000,
    env: { CI: '1', BROWSER: 'none' },
  },
});
