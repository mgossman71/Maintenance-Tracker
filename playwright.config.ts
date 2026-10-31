import { defineConfig, devices } from "@playwright/test";

const PORT = 8909;
const DATA_DIR = "/tmp/mt-e2e-data";

/**
 * E2E runs against the REAL server binary serving the BUILT SPA —
 * same-origin, single process, exactly like production (minus TLS).
 * One vault, one user → ordered flow in a single worker.
 */
export default defineConfig({
  testDir: "./e2e",
  // .e2e.ts on purpose: bun test claims *.spec/*.test files, so Playwright
  // must own a distinct suffix.
  testMatch: "*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 15_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun apps/server/src/index.ts",
    cwd: process.cwd(),
    env: {
      MT_PORT: String(PORT),
      MT_BIND: "127.0.0.1",
      MT_DATA_DIR: DATA_DIR,
      MT_INSECURE_COOKIES: "1",
      MT_ARGON2_PRESET: "test",
      TZ: "UTC",
    },
    // e2e/reset.ts guarantees the port is free and the vault empty
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
