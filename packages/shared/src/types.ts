export type CalendarUnit = "days" | "weeks" | "months" | "years";

export const CALENDAR_UNITS = ["days", "weeks", "months", "years"] as const;

/** Which physical meter a reading update or event refers to. */
export type MeterUnit = "miles" | "hours";
export const METER_UNITS = ["miles", "hours"] as const;

/** State of one evaluable schedule dimension (meter or calendar). */
export type DimensionState = "OK" | "DUE_SOON" | "DUE" | "OVERDUE" | "UNKNOWN";

/** Overall task status. DISABLED is carried separately as task.enabled=false. */
export type TaskStatus = "OK" | "DUE_SOON" | "DUE" | "OVERDUE" | "NEEDS_BASELINE";
