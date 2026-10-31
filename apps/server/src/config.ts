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
});

export interface AppConfig {
  port: number;
  bind: string;
  dataDir: string;
  trustProxy: boolean;
  tz: string | undefined;
  dbPath: string;
  webDir: string;
}

/** Default built-web location: apps/web/dist relative to this package. */
function defaultWebDir(): string {
  return fileURLToPath(new URL("../../web/dist", import.meta.url));
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.MT_PORT,
    bind: parsed.MT_BIND,
    dataDir: parsed.MT_DATA_DIR,
    trustProxy: parsed.MT_TRUST_PROXY === "1",
    tz: parsed.TZ,
    dbPath: `${parsed.MT_DATA_DIR.replace(/\/+$/, "")}/mt.db`,
    webDir: parsed.MT_WEB_DIR ?? defaultWebDir(),
  };
}
