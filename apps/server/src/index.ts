import { mkdirSync } from "node:fs";
import { deleteExpiredSessions, openDatabase, runMigrations } from "@maintenance-tracker/db";
import { createApp, makeDeps } from "./app.ts";
import { LoginGuard } from "./auth/ratelimit.ts";
import { loadConfig } from "./config.ts";
import { parseResetArgv, resetMasterPassword } from "./reset.ts";

const HELP = `maintenance-tracker — self-hosted maintenance tracker

usage: bun apps/server/src/index.ts [--reset-password [new-password]] [--help]

  --reset-password [new]  emergency master-password reset (§6.1): rewrites
                          the hash (prompted if no value given) and revokes
                          every session, then exits. Example in Docker:
                            docker compose exec app bun src/index.ts --reset-password
`;

const config = loadConfig();

mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
mkdirSync(config.filesDir, { recursive: true, mode: 0o700 }); // uploads live here (§6.8)
const { db } = openDatabase(config.dbPath);
runMigrations(db); // every startup migrates

// --reset-password: the one job, then we are done (§6.1)
const reset = parseResetArgv(process.argv.slice(2));
if (reset.help) {
  console.log(HELP);
  process.exit(0);
}
if (reset.reset) {
  const password = reset.password ?? prompt("New master password: ");
  if (password === null || password === "") {
    console.error("no password provided — cancelled, nothing changed");
    process.exit(1);
  }
  try {
    await resetMasterPassword(db, password);
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
  console.log("master password reset — every session revoked, sign in fresh");
  process.exit(0);
}

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
