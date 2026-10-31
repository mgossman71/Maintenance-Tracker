import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const DATA_DIR = "/tmp/mt-e2e-data";

export default function globalSetup(): void {
  // every suite starts from a pristine, un-set-up vault…
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync("/tmp/mt-e2e-state.json", { force: true });

  // …serving the freshly built SPA (build first: `bun run build && bun run e2e`)
  const index = resolve("apps/web/dist/index.html");
  if (!existsSync(index)) {
    throw new Error("apps/web/dist is missing — run `bun run build` before `bun run e2e`");
  }
}
