/**
 * Local administrative password reset (build-plan.md §8): works without
 * email, requires shell access to the data directory, and revokes every
 * existing session.
 *
 * Usage (host):   bun apps/server/src/cli/reset-password.ts --password "new-pass" [--data-dir ./data]
 * Usage (docker): docker compose exec app bun apps/server/src/cli/reset-password.ts --password "new-pass"
 *
 * Omit --password for an interactive prompt (no echo).
 */
import { createInterface } from "node:readline";
import { createAppDatabase, openDatabase, runMigrations } from "@mt/db";
import { hashPassword } from "../auth/password";
import { revokeAllSessions } from "../auth/sessions";
import { loadConfig } from "../config";
import { SETTING_KEYS, setSetting } from "../services/settings";

const PASSWORD_MIN_LENGTH = 10;

function arg(name: string): string | null {
	const index = process.argv.indexOf(`--${name}`);
	if (index === -1 || index === process.argv.length - 1) return null;
	return process.argv[index + 1] ?? null;
}

async function prompt(label: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	// Basic echo suppression on TTYs without extra dependencies.
	const echoOff = process.stdin.isTTY;
	if (echoOff) process.stdin.setRawMode(true);
	const answer = await new Promise<string>((resolve) => {
		const previous = process.stdout.write.bind(process.stdout);
		if (echoOff) process.stdin.resume();
		previous(`${label}`);
		let value = "";
		const onData = (chunk: Buffer) => {
			const text = chunk.toString();
			for (const ch of text) {
				if (ch === "\r" || ch === "\n") {
					process.stdin.off("data", onData);
					if (echoOff) {
						process.stdin.setRawMode(false);
						process.stdin.pause();
					}
					previous("\n");
					rl.close();
					resolve(value);
					return;
				}
				if (ch === "\u0003") process.exit(130); // Ctrl-C
				value += ch;
			}
		};
		process.stdin.on("data", onData);
	});
	return answer;
}

async function main(): Promise<void> {
	const dataDir = arg("data-dir") ?? process.env.MT_DATA_DIR ?? "./data";
	let password = arg("password");
	if (!password) password = await prompt("New master password: ");
	if (password.length < PASSWORD_MIN_LENGTH) {
		console.error(`Password too short: at least ${PASSWORD_MIN_LENGTH} characters required.`);
		process.exit(1);
	}

	const config = loadConfig({ MT_DATA_DIR: dataDir });
	const db = createAppDatabase(openDatabase(`${config.dataDir}/maintenance.db`));
	runMigrations(db); // safe when already migrated; fails loudly otherwise

	const hash = await hashPassword(password);
	setSetting(db, SETTING_KEYS.passwordHash, hash);
	setSetting(db, SETTING_KEYS.setupComplete, "true");
	revokeAllSessions(db);

	console.log("Password reset complete. All sessions revoked; existing users must log in again.");
}

main().catch((err) => {
	console.error("Password reset failed:", err instanceof Error ? err.message : err);
	process.exit(1);
});
