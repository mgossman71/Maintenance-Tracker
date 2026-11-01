import { formatMeter } from "@mt/shared";

export { formatMeter, parseMeterToTenths } from "@mt/shared";

export function formatMeterWithUnit(tenths: number | null, kind: string | undefined): string {
	if (tenths === null) return "—";
	const unit = kind === "hours" ? "h" : kind === "miles" ? "mi" : "";
	const value = formatMeter(tenths);
	const grouped = groupThousands(value);
	return unit ? `${grouped} ${unit}` : grouped;
}

export function groupThousands(plain: string): string {
	const [whole = plain, frac] = plain.split(".");
	const signed = whole.startsWith("-");
	const digits = signed ? whole.slice(1) : whole;
	const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return `${signed ? "-" : ""}${frac ? `${grouped}.${frac}` : grouped}`;
}

export function formatSignedMeter(tenths: number | null, kind: string | undefined): string {
	if (tenths === null) return "—";
	const abs = formatMeterWithUnit(Math.abs(tenths), kind);
	return tenths < 0 ? `${abs} over` : abs;
}

export function formatDate(iso: string | null): string {
	if (!iso) return "—";
	const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
	return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatMoney(cents: number | null): string {
	if (cents === null) return "—";
	return cents.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export const STATUS_LABEL: Record<string, string> = {
	OVERDUE: "Overdue",
	DUE: "Due now",
	DUE_SOON: "Due soon",
	NEEDS_BASELINE: "Needs baseline",
	OK: "OK",
	DISABLED: "Disabled",
};

export const STATUS_BADGE: Record<
	string,
	"overdue" | "due" | "soon" | "ok" | "unknown" | "disabled"
> = {
	OVERDUE: "overdue",
	DUE: "due",
	DUE_SOON: "soon",
	OK: "ok",
	NEEDS_BASELINE: "unknown",
	DISABLED: "disabled",
};
