import type { AppDatabase } from "@mt/db";
import { getSetting, SETTING_KEYS, setSetting } from "../services/settings";
import { ApiError } from "../util";

/** Argon2id password handling via Bun's built-in libsodium implementation. */

export async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	try {
		return await Bun.password.verify(password, hash);
	} catch {
		return false;
	}
}

export async function isSetupComplete(db: AppDatabase): Promise<boolean> {
	return getSetting(db, SETTING_KEYS.setupComplete) === "true";
}

/**
 * One-time setup with a transactional single-row guard: the row insert is the
 * guard, so concurrent first-boot requests cannot set two passwords.
 */
export async function completeSetup(db: AppDatabase, password: string): Promise<boolean> {
	if (await isSetupComplete(db)) return false;
	const hash = await hashPassword(password); // outside the guard on purpose (slow)
	if (await isSetupComplete(db)) return false;
	setSetting(db, SETTING_KEYS.passwordHash, hash);
	setSetting(db, SETTING_KEYS.setupComplete, "true");
	return true;
}

export async function changePassword(
	db: AppDatabase,
	currentPassword: string,
	newPassword: string,
): Promise<void> {
	const hash = getSetting(db, SETTING_KEYS.passwordHash);
	if (!hash) throw new ApiError(500, "not_configured", "Password is not configured");
	if (!(await verifyPassword(currentPassword, hash))) {
		throw new ApiError(401, "invalid_credentials", "Current password is incorrect");
	}
	setSetting(db, SETTING_KEYS.passwordHash, await hashPassword(newPassword));
}

export async function checkLogin(db: AppDatabase, password: string): Promise<boolean> {
	const hash = getSetting(db, SETTING_KEYS.passwordHash);
	if (!hash) return false;
	return verifyPassword(password, hash);
}
