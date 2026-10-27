import { defineConfig } from '@playwright/test';
import path from 'node:path';
if (process.env.MIXED_ASSET_E2E !== 'isolated' || !process.env.E2E_OUTPUT_DIR) {
  throw new Error('Use the repository test:e2e runner with disposable local services and external media files.');
}
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 90_000,
  expect: { timeout: 15_000 }, reporter: 'list',
  outputDir: path.join(process.env.E2E_OUTPUT_DIR, 'browser-results'),
  use: { baseURL: process.env.E2E_WEB_ORIGIN, channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome', headless: true,
    viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
});
