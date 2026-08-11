import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// Both apps are started automatically unless something is already listening
// on their port (your own dev servers), in which case those are reused -
// locally only, never in CI. Since RUN-48/50 the app persists through the
// API, so the backend and its PostgreSQL are required: the backend reads
// backend/.env locally (DATABASE_URL, JWT_SECRET) and connects at startup,
// so a red database fails the run loudly at boot instead of letting tests
// pass against nothing (RUN-51 AC3).
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  // A shared CI runner cold-compiling routes can blow a single 5s expect
  // budget; a retry separates "slow machine" from "broken app". Locally a
  // failure should stay loud and immediate.
  retries: isCI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // One-shot production start, not watch mode: deterministic and it
      // becomes healthy faster. /api/hello is the public liveness route.
      command: 'npm run build && npm run start:prod',
      cwd: '../backend',
      url: 'http://localhost:3000/api/hello',
      reuseExistingServer: !isCI,
      timeout: 120_000,
      // Without this a failed build dies silently inside the webServer and
      // the only symptom is a health-check timeout with no compiler output.
      stdout: 'pipe',
    },
    {
      // Dev server locally (instant reuse of your running one, no build
      // wait); production build in CI for the same determinism reason as
      // the backend - on-demand dev compiles on a small runner are exactly
      // the latency spikes that flake post-navigation assertions.
      command: isCI ? 'npm run build && npm start' : 'npm run dev',
      cwd: '../frontend',
      url: 'http://localhost:4200',
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: 'pipe',
    },
  ],
});
