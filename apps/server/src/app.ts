import { Hono } from "hono";
import { staticApp } from "./static.ts";

export interface AppOptions {
  /** Directory holding the built SPA; omitted in tests without static needs. */
  webDir?: string | undefined;
}

/**
 * App factory — no module-level state, so API tests run in-process
 * (build-plan.md §10). Auth middleware wraps this in M2; from then on,
 * everything except /login + /health requires a session cookie.
 */
export function createApp({ webDir }: AppOptions = {}) {
  const app = new Hono();

  // Private-ish responses must not sit in shared caches (§6.7).
  app.use("/api/*", async (c, next) => {
    c.header("cache-control", "no-store");
    await next();
  });

  // Public health for the reverse proxy — contentless, never leaks
  // version/config (§6.5). Shape pinned by the shared schema test.
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  if (webDir !== undefined) {
    app.use("*", staticApp(webDir));
  }

  app.notFound((c) => {
    if (new URL(c.req.url).pathname.startsWith("/api/")) {
      return c.json({ error: { code: "not_found" } }, 404);
    }
    return c.text("Not found", 404);
  });

  return app;
}
