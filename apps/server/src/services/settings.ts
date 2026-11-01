import type { AppDatabase } from "@mt/db";
import { appSettings } from "@mt/db";
import {
	DEFAULT_WARN_DAYS,
	DEFAULT_WARN_HOURS,
	DEFAULT_WARN_MILES,
	type SettingsDto,
} from "@mt/shared";
import { eq } from "drizzle-orm";

/** Key/value application settings with typed defaults. */

export const SETTING_KEYS = {
	warnMiles: "warn_miles",
	warnHours: "warn_hours",
	warnDays: "warn_days",
	staleReadingDays: "stale_reading_days",
	passwordHash: "password_hash",
	setupComplete: "setup_complete",
} as const;

export function getSetting(db: AppDatabase, key: string): string | null {
	const row = db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, key))
		.get();
	return row?.value ?? null;
}

export function setSetting(db: AppDatabase, key: string, value: string): void {
	const now = new Date().toISOString();
	db.insert(appSettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } })
		.run();
}

export function readSettings(db: AppDatabase): SettingsDto {
	const num = (key: string, fallback: number): number => {
		const raw = getSetting(db, key);
		const n = raw === null ? Number.NaN : Number.parseInt(raw, 10);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	};
	return {
		warnMiles: num(SETTING_KEYS.warnMiles, DEFAULT_WARN_MILES),
		warnHours: num(SETTING_KEYS.warnHours, DEFAULT_WARN_HOURS),
		warnDays: num(SETTING_KEYS.warnDays, DEFAULT_WARN_DAYS),
		staleReadingDays: num(SETTING_KEYS.staleReadingDays, 30),
	};
}

export function updateSettings(db: AppDatabase, patch: Partial<SettingsDto>): void {
	const map: Record<keyof SettingsDto, string> = {
		warnMiles: SETTING_KEYS.warnMiles,
		warnHours: SETTING_KEYS.warnHours,
		warnDays: SETTING_KEYS.warnDays,
		staleReadingDays: SETTING_KEYS.staleReadingDays,
	};
	for (const key of Object.keys(patch) as Array<keyof SettingsDto>) {
		const value = patch[key];
		if (value !== undefined) setSetting(db, map[key], String(value));
	}
}
