/**
 * Meter values are stored and computed as integer tenths of their unit
 * (127.5 hours -> 1275). All threshold arithmetic and the exactly-zero DUE
 * comparison happen in integer tenths — never in binary floating-point.
 */

export const METER_SCALE = 10;

/** Parse a user-supplied meter value into integer tenths. Max one decimal place. */
export function parseMeterToTenths(input: string | number): number | null {
	const str = typeof input === "number" ? stringOfNumber(input) : input.trim();
	if (str === "") return null;
	if (!/^-?\d+(\.\d)?$/.test(str)) return null;
	const tenths = Math.round(Number.parseFloat(str) * METER_SCALE);
	return Number.isFinite(tenths) ? tenths : null;
}

function stringOfNumber(n: number): string {
	if (!Number.isFinite(n)) return "";
	// Reject floats with more than one decimal place before rounding.
	if (Math.abs(n * METER_SCALE - Math.round(n * METER_SCALE)) > 1e-9) return "";
	return (Math.round(n * METER_SCALE) / METER_SCALE).toString();
}

/** Format integer tenths for display: 1275 -> "127.5", 1200 -> "120". */
export function formatMeter(tenths: number): string {
	const whole = Math.trunc(tenths / METER_SCALE);
	const frac = Math.abs(tenths % METER_SCALE);
	return frac === 0 ? String(whole) : `${whole}.${frac}`;
}

/** Signed difference in tenths. */
export function meterDifference(a: number, b: number): number {
	return a - b;
}

/**
 * Fuel volumes are stored as integer hundredths of a gallon (12.75 gal ->
 * 1275), matching pump precision. Same integer-only principle as meters.
 */
export const GALLON_SCALE = 100;

/** Parse a user-entered gallon amount (max two decimals) to hundredths. */
export function parseGallons(input: string | number | null | undefined): number | null {
	if (input === null || input === undefined) return null;
	const str = String(input).trim();
	if (str === "" || !/^\d+(\.\d{1,2})?$/.test(str)) return null;
	const hundredths = Math.round(Number.parseFloat(str) * GALLON_SCALE);
	return Number.isFinite(hundredths) ? hundredths : null;
}

/** Format integer gallon-hundredths for display: 1275 -> "12.75", 1200 -> "12". */
export function formatGallons(hundredths: number): string {
	const whole = Math.trunc(hundredths / GALLON_SCALE);
	const frac = hundredths % GALLON_SCALE;
	if (frac === 0) return String(whole);
	const fracStr = frac % 10 === 0 ? `${frac / 10}` : String(frac).padStart(2, "0");
	return `${whole}.${fracStr}`;
}
