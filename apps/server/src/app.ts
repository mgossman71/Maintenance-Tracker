import { type DatabaseHandle, seedTaskPresetsIfEmpty } from "@maintenance-tracker/db";
import { errorEnvelope, todayInTz } from "@maintenance-tracker/shared";
import { Hono } from "hono";
import type { LoginGuard } from "./auth/ratelimit.ts";
import type { SessionConfig } from "./auth/sessions.ts";
import { csrfProtection, requireSession } from "./http/middleware.ts";
import { attachmentsRoutes } from "./routes/attachments.ts";
import { authRoutes } from "./routes/auth.ts";
import { equipmentRoutes } from "./routes/equipment.ts";
import { interventionsRoutes } from "./routes/interventions.ts";
import { presetsRoutes } from "./routes/presets.ts";
import { tasksRoutes } from "./routes/tasks.ts";
import { staticApp } from "./static.ts";

export interface AppDeps {
  db: DatabaseHandle["db"];
  session: SessionConfig;
  guard: LoginGuard;
  trustProxy: boolean;
  tz: string;
  /** Upload byte store, DATA_DIR/files (§6.8). */
  filesDir: string;
  maxUploadBytes: number;
  /** Injectable clock — the engine and sessions become deterministic in tests. */
  clock: () => number;
  /** Local calendar "today" in the deployment timezone. */
  today: () => string;
}

export interface AppOptions {
  /** Directory holding the built SPA; omitted in tests without static needs. */
  webDir?: string | undefined;
  /**
   * Data routes exist ONLY with deps — and with deps comes the auth gate.
   * There is no way to mount CRUD unauthenticated (build-plan §9 M2).
   */
  deps?: AppDeps;
}

/**
 * App factory — no module-level state, so API tests run in-process
 * (build-plan.md §10).
 *
 * Middleware order is load-bearing:
 *   no-store on API → CSRF (all mutating API, incl. login) → auth gate → routes
 */
export function createApp({ webDir, deps }: AppOptions = {}) {
  const app = new Hono();

  // Private-ish responses must not sit in shared caches (§6.7).
  app.use("/api/*", async (c, next) => {
    c.header("cache-control", "no-store");
    await next();
  });

  // Public health for the reverse proxy — contentless, never leaks
  // version/config (§6.5). Shape pinned by the shared schema test.
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  if (deps !== undefined) {
    app.use("/api/*", csrfProtection({ trustProxy: deps.trustProxy }));
    app.use("/api/*", requireSession(deps));
    // §6.8 global request cap — reject by Content-Length before buffering
    app.use("/api/*", async (c, next) => {
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        const len = Number(c.req.header("content-length") ?? "0");
        if (len > deps.maxUploadBytes) {
          return c.json(errorEnvelope("payload_too_large"), 413);
        }
      }
      await next();
    });
    app.route("/api/auth", authRoutes(deps));
    app.route("/api/equipment", equipmentRoutes(deps));
    app.route("/api/tasks", tasksRoutes(deps));
    app.route("/api/presets", presetsRoutes(deps));
    app.route("/api/interventions", interventionsRoutes(deps));
    app.route("/api/attachments", attachmentsRoutes(deps));
  }

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

export function makeDeps(
  db: DatabaseHandle["db"],
  options: {
    session: SessionConfig;
    guard: LoginGuard;
    trustProxy?: boolean;
    tz?: string;
    clock?: () => number;
    filesDir?: string;
    maxUploadBytes?: number;
  },
): AppDeps {
  const clock = options.clock ?? (() => Date.now());
  const tz = options.tz ?? "UTC";
  // first-run task-library seeding (settings-keyed, idempotent) — every
  // boot path gets it, production and the in-process test kit alike
  seedTaskPresetsIfEmpty(db);
  return {
    db,
    session: options.session,
    guard: options.guard,
    trustProxy: options.trustProxy ?? false,
    tz,
    filesDir: options.filesDir ?? "data/files",
    maxUploadBytes: options.maxUploadBytes ?? 25 * 1024 * 1024,
    clock,
    today: () => todayInTz(clock(), tz),
  };
}
