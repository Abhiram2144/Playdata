import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /setup\/global-setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/teacher.json' },
      dependencies: ['setup'],
      testIgnore: /setup\/global-setup\.ts/,
    },
  ],
  // We drive our own `npm run dev` in a background shell (against the real
  // Supabase project configured in .env) rather than have Playwright manage
  // the server, since auth setup needs the server up first.
});
