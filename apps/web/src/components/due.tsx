import type { TaskWithDue } from "@maintenance-tracker/shared";
import { cn } from "@/lib/utils";

const CHIP: Record<TaskWithDue["due"]["status"], { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-destructive/15 text-destructive" },
  "due-soon": { label: "Due soon", className: "bg-soon/20 text-amber-700 dark:text-amber-400" },
  ok: { label: "OK", className: "bg-ok/15 text-emerald-700 dark:text-emerald-400" },
};

export function DueChip({ status }: { status: TaskWithDue["due"]["status"] }) {
  const chip = CHIP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        chip.className,
      )}
      data-testid={`due-chip-${status}`}
    >
      {chip.label}
    </span>
  );
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * Dashboard language: the maintenance INTERVAL first, then how far away
 * the work is — "every 12 mo or 1,000 mi · due in 400 mi". Meter counts
 * speak in miles/hours (what owners ask); days only carry the message
 * when there is no meter component.
 */
export function dashboardLine(task: TaskWithDue, unit: "mi" | "h" | null): string {
  const every: string[] = [];
  if (task.monthsInterval !== null) every.push(`${task.monthsInterval} mo`);
  if (task.meterInterval !== null && unit !== null)
    every.push(`${num(task.meterInterval)} ${unit}`);

  const r = task.due;
  let due: string | null = null;
  if (r.remainingMeter !== null && unit !== null) {
    due =
      r.remainingMeter <= 0
        ? `overdue by ${num(Math.abs(r.remainingMeter))} ${unit}`
        : `due in ${num(r.remainingMeter)} ${unit}`;
  } else if (r.remainingDays !== null) {
    due = r.remainingDays <= 0 ? `overdue since ${r.nextDueDate}` : `due in ${r.remainingDays} d`;
  } else if (r.nextDueDate !== null) {
    due = `due ${r.nextDueDate}`;
  }

  return [every.length > 0 ? `every ${every.join(" or ")}` : null, due]
    .filter((p): p is string => p !== null)
    .join(" · ");
}

/** "due 2026-11-02 · in 138 d" / "due at 1,000mi · 400 to go" — the verdict, compactly. */
export function dueSummary(task: TaskWithDue, unit: "mi" | "h" | null): string {
  const parts: string[] = [];
  if (task.due.nextDueDate !== null) {
    parts.push(
      task.due.remainingDays === null
        ? `due ${task.due.nextDueDate}`
        : task.due.remainingDays <= 0
          ? `overdue since ${task.due.nextDueDate}`
          : `due ${task.due.nextDueDate} · in ${task.due.remainingDays} d`,
    );
  }
  if (task.due.nextDueMeter !== null) {
    const m = task.due.nextDueMeter.toLocaleString("en-US");
    const r = task.due.remainingMeter;
    parts.push(
      r === null
        ? `due at ${m}${unit ?? ""}`
        : r <= 0
          ? `overdue by ${Math.abs(r).toLocaleString("en-US")}${unit ?? ""} (was due at ${m})`
          : `due at ${m}${unit ?? ""} · ${r.toLocaleString("en-US")} to go`,
    );
  }
  return parts.join(" · ");
}
