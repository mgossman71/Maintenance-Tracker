import { defineConfig, devices } from "@playwright/test";

/** E2E runs against the production build served by the app server itself. */
export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 60_000,
	forbidOnly: true,
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://127.0.0.1:4173",
		viewport: { width: 1280, height: 900 },
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "bun apps/server/src/index.ts",
		env: {
			MT_DATA_DIR: "/tmp/mt-e2e-playwright",
			MT_PORT: "4173",
			MT_SECURE_COOKIES: "0",
			MT_BIND: "127.0.0.1",
			MT_WEB_DIST: "apps/web/dist",
		},
		url: "http://127.0.0.1:4173/health",
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
