/**
 * e2e pre-run reset — invoked by `bun run e2e` BEFORE playwright starts.
 * (globalSetup cannot own this: it races webServer startup.)
 *
 * 1. kill any orphaned e2e server still holding the port/vault open
 * 2. wipe the e2e vault → the fresh server starts at first-run setup
 * 3. clear the exported storageState from previous runs
 * 4. refuse to run against a stale/missing SPA bundle
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 8909;
const DATA_DIR = "/tmp/mt-e2e-data";

try {
  execSync(`lsof -ti tcp:${PORT} | xargs kill -9`, { stdio: "ignore" });
  execSync("sleep 0.25"); // let the OS release the port
} catch {
  // nothing was listening — perfect
}

rmSync(DATA_DIR, { recursive: true, force: true });
rmSync("/tmp/mt-e2e-state.json", { force: true });

if (!existsSync(resolve("apps/web/dist/index.html"))) {
  console.error("apps/web/dist is missing — run `bun run build` before `bun run e2e`");
  process.exit(1);
}
