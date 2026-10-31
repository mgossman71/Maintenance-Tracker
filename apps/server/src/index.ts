import { mkdirSync } from "node:fs";
import { openDatabase, runMigrations } from "@maintenance-tracker/db";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();

mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
const { db } = openDatabase(config.dbPath);
runMigrations(db); // every startup migrates (M0: rollback point for future backups)

const app = createApp({ webDir: config.webDir });
const server = Bun.serve({ port: config.port, hostname: config.bind, fetch: app.fetch });

console.log(
  `maintenance-tracker listening on http://${server.hostname}:${server.port} ` +
    `(data: ${config.dataDir}, trustProxy: ${config.trustProxy})`,
);

void db; // real repositories arrive in M1/M2
