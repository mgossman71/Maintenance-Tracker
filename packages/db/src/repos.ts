/**
 * Thin repository layer over Drizzle — routes validate, repos persist.
 * Every row id is generated here (crypto.randomUUID) so callers never forge one.
 */

import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import type { DatabaseHandle } from "./client.ts";
import {
  appSettings,
  attachment,
  equipment,
  intervention,
  session,
  task,
  taskPreset,
} from "./schema.ts";

type Db = DatabaseHandle["db"];

// ---- app settings ------------------------------------------------------------

export function getSetting(db: Db, key: string): string | null {
  return (
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).get()
      ?.value ?? null
  );
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(appSettings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
    .run();
}

// ---- sessions ------------------------------------------------------------------

export interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

export function insertSession(db: Db, row: SessionRow): void {
  db.insert(session).values(row).run();
}

export function selectSession(db: Db, id: string): SessionRow | null {
  return db.select().from(session).where(eq(session.id, id)).get() ?? null;
}

export function touchSession(db: Db, id: string, lastSeenAt: string, expiresAt?: string): void {
  db.update(session)
    .set(expiresAt ? { lastSeenAt, expiresAt } : { lastSeenAt })
    .where(eq(session.id, id))
    .run();
}

export function deleteSession(db: Db, id: string): void {
  db.delete(session).where(eq(session.id, id)).run();
}

export function deleteAllSessions(db: Db): void {
  db.delete(session).run();
}

export function deleteExpiredSessions(db: Db, nowIso: string): void {
  db.delete(session).where(lt(session.expiresAt, nowIso)).run();
}

// ---- equipment ---------------------------------------------------------------

export type EquipmentRow = typeof equipment.$inferSelect;
export type TaskRow = typeof task.$inferSelect;
export type InterventionRow = typeof intervention.$inferSelect;

export function listEquipment(db: Db): EquipmentRow[] {
  return db.select().from(equipment).all();
}

export function getEquipment(db: Db, id: string): EquipmentRow | null {
  return db.select().from(equipment).where(eq(equipment.id, id)).get() ?? null;
}

export function insertEquipment(
  db: Db,
  data: {
    name: string;
    description?: string | null;
    icon?: string;
    year?: number | null;
    meterKind?: string;
  },
): EquipmentRow {
  const row = {
    id: randomUUID(),
    name: data.name,
    description: data.description ?? null,
    icon: data.icon ?? "",
    year: data.year ?? null,
    meterKind: data.meterKind ?? "none",
  };
  db.insert(equipment).values(row).run();
  const created = getEquipment(db, row.id);
  if (created === null) throw new Error("insert failed to persist equipment");
  return created;
}

export function updateEquipment(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      EquipmentRow,
      "name" | "description" | "icon" | "meterKind" | "reading" | "readingUpdatedAt"
    >
  >,
): EquipmentRow | null {
  db.update(equipment).set(patch).where(eq(equipment.id, id)).run();
  return getEquipment(db, id);
}

export function deleteEquipment(db: Db, id: string): void {
  db.delete(equipment).where(eq(equipment.id, id)).run();
}

// ---- tasks ---------------------------------------------------------------------

export function listTasksForEquipment(db: Db, equipmentId: string): TaskRow[] {
  return db.select().from(task).where(eq(task.equipmentId, equipmentId)).all();
}

export function getTask(db: Db, id: string): TaskRow | null {
  return db.select().from(task).where(eq(task.id, id)).get() ?? null;
}

export function insertTask(
  db: Db,
  data: {
    equipmentId: string;
    name: string;
    description?: string | null;
    kind: string;
    monthsInterval?: number | null;
    meterInterval?: number | null;
    baselineMeter?: number | null;
    currentExpiryDate?: string | null;
  },
): TaskRow {
  const row = {
    id: randomUUID(),
    equipmentId: data.equipmentId,
    name: data.name,
    description: data.description ?? null,
    kind: data.kind,
    monthsInterval: data.monthsInterval ?? null,
    meterInterval: data.meterInterval ?? null,
    baselineMeter: data.baselineMeter ?? null,
    currentExpiryDate: data.currentExpiryDate ?? null,
  };
  db.insert(task).values(row).run();
  const created = getTask(db, row.id);
  if (created === null) throw new Error("insert failed to persist task");
  return created;
}

export function updateTask(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      TaskRow,
      | "name"
      | "description"
      | "monthsInterval"
      | "meterInterval"
      | "baselineMeter"
      | "currentExpiryDate"
      | "updatedAt"
    >
  >,
): TaskRow | null {
  db.update(task)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(task.id, id))
    .run();
  return getTask(db, id);
}

export function deleteTask(db: Db, id: string): void {
  db.delete(task).where(eq(task.id, id)).run();
}

// ---- interventions ------------------------------------------------------------

export function listInterventionsForEquipment(db: Db, equipmentId: string): InterventionRow[] {
  return db
    .select()
    .from(intervention)
    .where(eq(intervention.equipmentId, equipmentId))
    .all()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); // newest first
}

export function getIntervention(db: Db, id: string): InterventionRow | null {
  return db.select().from(intervention).where(eq(intervention.id, id)).get() ?? null;
}

export function insertIntervention(
  db: Db,
  data: Omit<typeof intervention.$inferInsert, "id" | "createdAt">,
): InterventionRow {
  const row = { ...data, id: randomUUID() };
  db.insert(intervention).values(row).run();
  const created = getIntervention(db, row.id);
  if (created === null) throw new Error("insert failed to persist intervention");
  return created;
}

export function updateIntervention(
  db: Db,
  id: string,
  patch: Partial<
    Omit<typeof intervention.$inferInsert, "id" | "taskId" | "equipmentId" | "label" | "createdAt">
  >,
): InterventionRow | null {
  db.update(intervention).set(patch).where(eq(intervention.id, id)).run();
  return getIntervention(db, id);
}

export function deleteIntervention(db: Db, id: string): void {
  db.delete(intervention).where(eq(intervention.id, id)).run();
}

/**
 * When a reading is recorded, meter tasks on that equipment that have NOT
 * been serviced with a meter reading yet (and have no baseline pinned)
 * start counting from THIS reading — the user just told us where the meter
 * stands. The anchor then never rotates: subsequent readings eat into the
 * interval for real.
 */
export function backfillTaskMeterBaselines(db: Db, equipmentId: string, reading: number): void {
  const open = db
    .select()
    .from(task)
    .where(
      and(
        eq(task.equipmentId, equipmentId),
        isNull(task.baselineMeter),
        isNotNull(task.meterInterval),
      ),
    )
    .all();
  for (const t of open) {
    const meteredWork = db
      .select({ id: intervention.id })
      .from(intervention)
      .where(and(eq(intervention.taskId, t.id), isNotNull(intervention.meterAt)))
      .all();
    if (meteredWork.length === 0) updateTask(db, t.id, { baselineMeter: reading });
  }
}

// ---- attachments (metadata; bytes live in DATA_DIR/files, §6.8) -------------------

export function getAttachment(db: Db, id: string): AttachmentRow | null {
  return db.select().from(attachment).where(eq(attachment.id, id)).get() ?? null;
}

export type AttachmentRow = typeof attachment.$inferSelect;

export function listAttachmentsForEquipment(db: Db, equipmentId: string): AttachmentRow[] {
  return db
    .select()
    .from(attachment)
    .where(eq(attachment.equipmentId, equipmentId))
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listAttachmentsForIntervention(db: Db, interventionId: string): AttachmentRow[] {
  return db.select().from(attachment).where(eq(attachment.interventionId, interventionId)).all();
}

export function insertAttachment(
  db: Db,
  data: {
    equipmentId: string;
    interventionId: string | null;
    filename: string;
    storedName: string;
    mimeType: string;
    sizeBytes: number;
  },
): AttachmentRow {
  const row = { id: randomUUID(), ...data };
  db.insert(attachment).values(row).run();
  const created = getAttachment(db, row.id);
  if (created === null) throw new Error("insert failed to persist attachment");
  return created;
}

export function deleteAttachment(db: Db, id: string): void {
  db.delete(attachment).where(eq(attachment.id, id)).run();
}

// ---- cascade recalculation (intervention edit/delete, build-plan §2/§4) ----------

/**
 * When the intervention that LAST advanced the meter is edited away or
 * deleted, roll the equipment reading back to the highest remaining
 * recorded meterAt (or null). Callers invoke this only when the touched
 * row's meterAt equaled the equipment's current reading — an explicit
 * reading taken after the work is intentionally kept (the UI's correct-
 * reading flow remains the escape hatch for anything else).
 */
export function recalcMeterFromInterventions(db: Db, equipmentId: string): void {
  const eq = getEquipment(db, equipmentId);
  if (eq === null) return;
  const withMeter = listInterventionsForEquipment(db, equipmentId).filter(
    (i) => i.meterAt !== null,
  );
  withMeter.sort(
    (a, b) => (a.meterAt as number) - (b.meterAt as number) || a.date.localeCompare(b.date),
  );
  const top = withMeter[withMeter.length - 1];
  updateEquipment(db, equipmentId, {
    reading: top?.meterAt ?? null,
    readingUpdatedAt: top?.date ?? null,
  });
}

/** Expiry tasks: currentExpiryDate = the latest expiry recorded by its work. */
export function recalcTaskExpiry(db: Db, taskId: string): void {
  const rows = db.select().from(intervention).where(eq(intervention.taskId, taskId)).all();
  const dates = rows
    .map((i) => i.expiryDate)
    .filter((d): d is string => d !== null)
    .sort();
  updateTask(db, taskId, {
    currentExpiryDate: dates.length > 0 ? (dates[dates.length - 1] as string) : null,
  });
}

// ---- task presets (the editable task library) -------------------------------------

export type TaskPresetRow = typeof taskPreset.$inferSelect;

export function listTaskPresets(db: Db): TaskPresetRow[] {
  // stable order: sort_order, then name for ties (schema default 0)
  return db
    .select()
    .from(taskPreset)
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function getTaskPreset(db: Db, id: string): TaskPresetRow | null {
  return db.select().from(taskPreset).where(eq(taskPreset.id, id)).get() ?? null;
}

export function insertTaskPreset(
  db: Db,
  data: {
    name: string;
    monthsInterval?: number | null;
    meterInterval?: number | null;
    sortOrder?: number;
  },
): TaskPresetRow {
  const row = {
    id: randomUUID(),
    name: data.name,
    monthsInterval: data.monthsInterval ?? null,
    meterInterval: data.meterInterval ?? null,
    sortOrder: data.sortOrder ?? nextPresetSortOrder(db),
  };
  db.insert(taskPreset).values(row).run();
  const created = getTaskPreset(db, row.id);
  if (created === null) throw new Error("insert failed to persist task preset");
  return created;
}

export function updateTaskPreset(
  db: Db,
  id: string,
  patch: Partial<{
    name: string;
    monthsInterval: number | null;
    meterInterval: number | null;
    sortOrder: number;
  }>,
): TaskPresetRow | null {
  db.update(taskPreset).set(patch).where(eq(taskPreset.id, id)).run();
  return getTaskPreset(db, id);
}

export function deleteTaskPreset(db: Db, id: string): void {
  db.delete(taskPreset).where(eq(taskPreset.id, id)).run();
}

export function nextPresetSortOrder(db: Db): number {
  const rows = listTaskPresets(db);
  return rows.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 10;
}

/**
 * First-run seeding (build-plan §9 M5/M8): generic car/boat/home starters,
 * ONCE — guarded by a settings key so a deliberately emptied library stays
 * empty. Idempotent; safe to call on every boot.
 */
export function seedTaskPresetsIfEmpty(db: Db): boolean {
  if (getSetting(db, "presets_seeded_at") !== null) return false;
  for (const p of STARTER_PRESETS) {
    insertTaskPreset(db, { ...p, sortOrder: 0 });
  }
  setSetting(db, "presets_seeded_at", new Date().toISOString());
  return true;
}

const STARTER_PRESETS: {
  name: string;
  monthsInterval: number | null;
  meterInterval: number | null;
}[] = [
  // car
  { name: "Oil change", monthsInterval: 12, meterInterval: 5000 },
  { name: "Tire rotation", monthsInterval: 6, meterInterval: 5000 },
  { name: "Engine air filter", monthsInterval: 12, meterInterval: 12000 },
  { name: "Cabin air filter", monthsInterval: 12, meterInterval: null },
  { name: "Wiper blades", monthsInterval: 12, meterInterval: null },
  { name: "Coolant flush", monthsInterval: 24, meterInterval: 30000 },
  { name: "Transmission fluid", monthsInterval: 36, meterInterval: 30000 },
  { name: "Brake fluid", monthsInterval: 24, meterInterval: null },
  // boat
  { name: "Impeller", monthsInterval: 24, meterInterval: 250 },
  { name: "Engine oil change (boat)", monthsInterval: 12, meterInterval: 100 },
  { name: "Fuel filter (boat)", monthsInterval: 12, meterInterval: 100 },
  { name: "Zinc anodes", monthsInterval: 12, meterInterval: null },
  { name: "Bottom paint", monthsInterval: 12, meterInterval: null },
  { name: "Battery (boat)", monthsInterval: 48, meterInterval: null },
  // home
  { name: "HVAC filter", monthsInterval: 3, meterInterval: null },
  { name: "Smoke & CO alarm batteries", monthsInterval: 12, meterInterval: null },
  { name: "Water heater flush", monthsInterval: 24, meterInterval: null },
  { name: "Gutter cleaning", monthsInterval: 12, meterInterval: null },
  { name: "Caulk inspection", monthsInterval: 24, meterInterval: null },
];
