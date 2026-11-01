export type MeterKind = "miles" | "hours" | "none";
export type CalendarUnit = "days" | "weeks" | "months" | "years";

export const METER_KINDS = ["miles", "hours", "none"] as const;
export const CALENDAR_UNITS = ["days", "weeks", "months", "years"] as const;

/** State of one evaluable schedule dimension (meter or calendar). */
export type DimensionState = "OK" | "DUE_SOON" | "DUE" | "OVERDUE" | "UNKNOWN";

/** Overall task status. DISABLED is carried separately as task.enabled=false. */
export type TaskStatus = "OK" | "DUE_SOON" | "DUE" | "OVERDUE" | "NEEDS_BASELINE";

export const METER_UNIT_LABEL: Record<Exclude<MeterKind, "none">, string> = {
	miles: "miles",
	hours: "hours",
};
