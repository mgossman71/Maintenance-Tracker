import { z } from "zod";
import { dueReasonSchema, dueStatusSchema, meterKindSchema, taskKindSchema } from "./domain.ts";

// ---- cookies & the error envelope -----------------------------------------

export const MT_SESSION_COOKIE = "__Host-mt_session";
/** Local-dev name when MT_INSECURE_COOKIES=1 (__Host- requires Secure/TLS). */
export const MT_SESSION_COOKIE_DEV = "mt_session_dev";

export const errorCodes = [
  "validation_failed",
  "not_found",
  "session_required",
  "invalid_credentials",
  "setup_complete",
  "csrf_failed",
  "rate_limited",
  "locked",
  "insecure_transport",
  "meter_regressed",
  "meterless_equipment",
  "task_equipment_mismatch",
  "unsupported_media",
  "payload_too_large",
  "baseline_anchored_by_history", // editing a baseline the recorded work already owns
] as const;
export type ErrorCode = (typeof errorCodes)[number];

/** Every API error is this shape — code first, message for humans, details for forms. */
export const errorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(errorCodes),
    message: z.string().optional(),
    details: z.array(z.looseObject({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Build an error body and keep the literal type honest. */
export function errorEnvelope(
  code: ErrorCode,
  extra?: Omit<ErrorEnvelope["error"], "code">,
): ErrorEnvelope {
  return { error: { code, ...extra } };
}

// ---- shared primitives -------------------------------------------------------

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// ---- auth --------------------------------------------------------------------

export const authStatusSchema = z.strictObject({ setupComplete: z.boolean() });
export type AuthStatus = z.infer<typeof authStatusSchema>;

export const setupRequestSchema = z.strictObject({
  password: z.string().min(12, "master password needs at least 12 characters").max(512),
});

export const loginRequestSchema = z.strictObject({
  // Intentionally no min-length here: login must fail with the ONE generic
  // error, not leak policy through a 400.
  password: z.string().min(1).max(512),
});

export const changePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(512),
  newPassword: z.string().min(12).max(512),
});

export const sessionInfoSchema = z.strictObject({
  createdAt: z.string(),
  expiresAt: z.string(),
  lastSeenAt: z.string(),
});

// ---- equipment ---------------------------------------------------------------

export const equipmentCreateSchema = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  icon: z.string().max(16).optional(),
  /** Model/build year — optional; the UI offers 1900..next year. */
  year: z.number().int().min(1900).max(2100).nullish(),
  meterKind: meterKindSchema.optional(),
});
export type EquipmentCreate = z.infer<typeof equipmentCreateSchema>;

export const equipmentUpdateSchema = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  icon: z.string().max(16).optional(),
  year: z.number().int().min(1900).max(2100).nullish(),
  /** Always editable; the edit form confirms unit switches with readings. */
  meterKind: meterKindSchema.optional(),
});
export type EquipmentUpdate = z.infer<typeof equipmentUpdateSchema>;

export const readingUpdateSchema = z.strictObject({
  reading: z.number().nonnegative(),
  date: isoDateSchema.optional(),
  /**
   * Explicit "correct reading" acknowledgment (§2): a reading that LOWERS
   * the current one is rejected with meter_regressed unless this is true.
   * The UI must force the user into this branch deliberately — the meter
   * never lowers *silently*.
   */
  correct: z.boolean().optional(),
});
export type ReadingUpdate = z.infer<typeof readingUpdateSchema>;

// ---- tasks -------------------------------------------------------------------

const taskIntervals = (
  v: {
    kind: "interval" | "expiry";
    monthsInterval?: number | null;
    meterInterval?: number | null;
    baselineMeter?: number | null;
  },
  ctx: z.RefinementCtx,
) => {
  if (v.kind === "interval" && v.monthsInterval == null && v.meterInterval == null) {
    ctx.addIssue({
      code: "custom",
      path: ["monthsInterval"],
      message: "interval tasks need at least one of monthsInterval / meterInterval",
    });
  }
  if (v.baselineMeter != null && v.meterInterval == null) {
    ctx.addIssue({
      code: "custom",
      path: ["baselineMeter"],
      message: "baselineMeter only anchors a meter interval",
    });
  }
  if (v.kind === "expiry" && (v.monthsInterval != null || v.meterInterval != null)) {
    ctx.addIssue({
      code: "custom",
      path: ["kind"],
      message: "expiry tasks carry no intervals",
    });
  }
};

export const taskCreateSchema = z
  .strictObject({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullish(),
    kind: taskKindSchema,
    monthsInterval: z.number().int().min(1).nullish(),
    meterInterval: z.number().positive().nullish(),
    /**
     * Pin where the meter count starts (0 = "due at exactly meterInterval",
     * i.e. an absolute first-service point). Absent = the equipment's
     * current reading. Server-owned; the equipment form uses 0.
     */
    baselineMeter: z.number().nonnegative().nullish(),
    currentExpiryDate: isoDateSchema.nullish(),
  })
  .superRefine(taskIntervals);
export type TaskCreate = z.infer<typeof taskCreateSchema>;

/** kind is fixed at creation (§4) — deliberately absent here. */
export const taskUpdateSchema = z
  .strictObject({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    monthsInterval: z.number().int().min(1).nullish(),
    meterInterval: z.number().positive().nullish(),
    /**
     * Re-pin where the meter count starts — what the edit form's absolute
     * "next service due at N" becomes (baseline = N − interval). Server
     * rejects it when the RESULT has no meter interval, or when recorded
     * work already anchors the count (history beats baseline).
     */
    baselineMeter: z.number().nonnegative().nullish(),
    currentExpiryDate: isoDateSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    // explicit "remove the meter interval" alongside a baseline is nonsense
    if (v.meterInterval === null && v.baselineMeter != null) {
      ctx.addIssue({
        code: "custom",
        path: ["baselineMeter"],
        message: "baselineMeter only anchors a meter interval",
      });
    }
    if (v.monthsInterval == null && v.meterInterval == null) return; // patch semantics; server re-checks result
    taskIntervals(
      { kind: "interval", monthsInterval: v.monthsInterval, meterInterval: v.meterInterval },
      ctx,
    );
  });
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

// ---- task presets (task library) ------------------------------------------------

export const taskPresetCreateSchema = z.strictObject({
  name: z.string().min(1).max(200),
  monthsInterval: z.number().int().min(1).nullish(),
  meterInterval: z.number().positive().nullish(),
});
export type TaskPresetCreate = z.infer<typeof taskPresetCreateSchema>;

export const taskPresetUpdateSchema = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  monthsInterval: z.number().int().min(1).nullish(),
  meterInterval: z.number().positive().nullish(),
});
export type TaskPresetUpdate = z.infer<typeof taskPresetUpdateSchema>;

// ---- interventions -------------------------------------------------------------

export const interventionCreateSchema = z
  .strictObject({
    taskId: z.string().nullish(),
    label: z.string().min(1).max(200).nullish(),
    date: isoDateSchema,
    meterAt: z.number().nonnegative().nullish(),
    location: z.string().max(200).nullish(),
    performedBy: z.string().max(200).nullish(),
    comments: z.string().max(4000).nullish(),
    expiryDate: isoDateSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    const has = (x: string | null | undefined) => x !== null && x !== undefined;
    if (has(v.taskId) === has(v.label)) {
      ctx.addIssue({
        code: "custom",
        path: ["taskId"],
        message: "exactly one of taskId (task work) or label (equipment-level work)",
      });
    }
  });
export type InterventionCreate = z.infer<typeof interventionCreateSchema>;

export const interventionUpdateSchema = z.strictObject({
  date: isoDateSchema.optional(),
  meterAt: z.number().nonnegative().nullish(),
  location: z.string().max(200).nullish(),
  performedBy: z.string().max(200).nullish(),
  comments: z.string().max(4000).nullish(),
  expiryDate: isoDateSchema.nullish(),
});
export type InterventionUpdate = z.infer<typeof interventionUpdateSchema>;

// ---- response composites (server → client typing) ------------------------------

export const dueStatusInfoSchema = z.strictObject({
  status: dueStatusSchema,
  nextDueDate: isoDateSchema.nullable(),
  nextDueMeter: z.number().nullable(),
  remainingDays: z.number().nullable(),
  remainingMeter: z.number().nullable(),
  elapsedDays: z.number().nullable(),
  elapsedMeter: z.number().nullable(),
  reasons: z.array(dueReasonSchema),
});
export type DueStatusInfo = z.infer<typeof dueStatusInfoSchema>;

export interface TaskWithDue {
  id: string;
  equipmentId: string;
  name: string;
  description: string | null;
  kind: "interval" | "expiry";
  monthsInterval: number | null;
  meterInterval: number | null;
  currentExpiryDate: string | null;
  due: DueStatusInfo;
}

/** The task library shape over the wire (a task_preset row). */
export interface TaskPresetInfo {
  id: string;
  name: string;
  monthsInterval: number | null;
  meterInterval: number | null;
  sortOrder: number;
}

/** An attachment's metadata over the wire (bytes come from the GET route). */
export interface AttachmentInfo {
  id: string;
  equipmentId: string;
  interventionId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** A recorded intervention over the wire. */
export interface InterventionInfo {
  id: string;
  taskId: string | null;
  equipmentId: string;
  label: string | null;
  date: string;
  meterAt: number | null;
  location: string | null;
  performedBy: string | null;
  comments: string | null;
  expiryDate: string | null;
  createdAt: string;
}
