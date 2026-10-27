import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Separate from correctness tests: one worker, alternating samples, no timing assertions.
export default defineConfig({
  ...config,
  testMatch: '**/*.bench.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  projects: config.projects?.map(project => ({
    ...project, use: { ...project.use, channel: 'chromium' },
  })),
});
