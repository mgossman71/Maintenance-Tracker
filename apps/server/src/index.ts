import { createAppDatabase, openDatabase, runMigrations, seedBuiltinPresets } from "@mt/db";
import { createApp } from "./app";
import { pruneSessions } from "./auth/sessions";
import { loadConfig } from "./config";

const config = loadConfig();
const raw = openDatabase(`${config.dataDir}/maintenance.db`);
const db = createAppDatabase(raw);

try {
	await runMigrations(db);
} catch (err) {
	console.error("[fatal] Migrations failed; refusing to start with a partial schema:", err);
	process.exit(1);
}
seedBuiltinPresets(db);
pruneSessions(db, config);

const app = createApp({ db, config });

console.log(
	`[maintenance-tracker] v${config.version} listening on http://${config.bind}:${config.port}`,
);
console.log(`[maintenance-tracker] data dir: ${config.dataDir}; timezone: ${config.timezone}`);

export default {
	port: config.port,
	hostname: config.bind,
	fetch: app.fetch,
};
