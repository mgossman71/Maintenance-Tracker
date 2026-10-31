import { mkdirSync } from "node:fs";
import { deleteExpiredSessions, openDatabase, runMigrations } from "@maintenance-tracker/db";
import { createApp, makeDeps } from "./app.ts";
import { LoginGuard } from "./auth/ratelimit.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();

mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
mkdirSync(config.filesDir, { recursive: true, mode: 0o700 }); // uploads live here (§6.8)
const { db } = openDatabase(config.dbPath);
runMigrations(db); // every startup migrates

const deps = makeDeps(db, {
  session: {
    idleMs: config.sessionIdleMs,
    absoluteMs: config.sessionAbsoluteMs,
    insecureCookies: config.insecureCookies,
  },
  guard: new LoginGuard(),
  trustProxy: config.trustProxy,
  tz: config.tz,
  filesDir: config.filesDir,
  maxUploadBytes: config.maxUploadBytes,
});
deleteExpiredSessions(db, new Date().toISOString());

const app = createApp({ webDir: config.webDir, deps });
const server = Bun.serve({ port: config.port, hostname: config.bind, fetch: app.fetch });

console.log(
  `maintenance-tracker listening on http://${server.hostname}:${server.port} ` +
    `(data: ${config.dataDir}, trustProxy: ${config.trustProxy}, tz: ${config.tz})`,
);
