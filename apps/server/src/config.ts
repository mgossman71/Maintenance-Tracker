import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Env-first config (build-plan.md §5). Parsing is strict about shape,
 * defaulted for everything except secrets (of which there are none yet).
 */
const EnvSchema = z.object({
  MT_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  MT_BIND: z.string().min(1).default("127.0.0.1"),
  MT_DATA_DIR: z.string().min(1).default("data"),
  MT_TRUST_PROXY: z.enum(["0", "1"]).default("0"),
  TZ: z.string().min(1).optional(),
  /** Override location of the built SPA (defaults to apps/web/dist). */
  MT_WEB_DIR: z.string().min(1).optional(),
  /** Session idle window (§6.2), days. */
  MT_SESSION_IDLE_DAYS: z.coerce.number().positive().max(365).default(30),
  /** Session absolute cap regardless of activity (§6.2), days. */
  MT_SESSION_ABSOLUTE_DAYS: z.coerce.number().positive().max(730).default(90),
  /** Local dev over plain http: drop Secure/__Host- cookie traits (§6.6). */
  MT_INSECURE_COOKIES: z.enum(["0", "1"]).default("0"),
  /** Per-upload / request-body cap (§6.8), megabytes. */
  MT_MAX_UPLOAD_MB: z.coerce.number().int().positive().max(500).default(25),
});

export interface AppConfig {
  port: number;
  bind: string;
  dataDir: string;
  trustProxy: boolean;
  tz: string;
  dbPath: string;
  webDir: string;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  insecureCookies: boolean;
  /** Upload byte store: DATA_DIR/files (§6.8), mode 0700. */
  filesDir: string;
  maxUploadBytes: number;
}

/** Default built-web location: apps/web/dist relative to this package. */
function defaultWebDir(): string {
  return fileURLToPath(new URL("../../web/dist", import.meta.url));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.MT_PORT,
    bind: parsed.MT_BIND,
    dataDir: parsed.MT_DATA_DIR,
    trustProxy: parsed.MT_TRUST_PROXY === "1",
    tz: parsed.TZ ?? "UTC",
    dbPath: `${parsed.MT_DATA_DIR.replace(/\/+$/, "")}/mt.db`,
    webDir: parsed.MT_WEB_DIR ?? defaultWebDir(),
    sessionIdleMs: parsed.MT_SESSION_IDLE_DAYS * DAY_MS,
    sessionAbsoluteMs: parsed.MT_SESSION_ABSOLUTE_DAYS * DAY_MS,
    insecureCookies: parsed.MT_INSECURE_COOKIES === "1",
    filesDir: `${parsed.MT_DATA_DIR.replace(/\/+$/, "")}/files`,
    maxUploadBytes: parsed.MT_MAX_UPLOAD_MB * 1024 * 1024,
  };
}
