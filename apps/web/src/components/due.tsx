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
 * Dashboard language, in the owner's words: how much has been USED since
 * the last service (or the baseline when never serviced) and what is LEFT
 * — due: "600 mi since last service · due in 400 mi" — plus the interval,
 * every: "every 1,000 mi". Split in two so the due statement can be shown
 * LOUDER than the interval. Meter counts speak in miles/hours; days only
 * when there is no meter.
 */
export function dashboardParts(
  task: TaskWithDue,
  unit: "mi" | "h" | null,
): { every: string | null; due: string | null } {
  const every: string[] = [];
  if (task.monthsInterval !== null) every.push(`${task.monthsInterval} mo`);
  if (task.meterInterval !== null && unit !== null)
    every.push(`${num(task.meterInterval)} ${unit}`);

  const r = task.due;
  const parts: string[] = [];
  if (unit !== null && (r.elapsedMeter !== null || r.remainingMeter !== null)) {
    if (r.elapsedMeter !== null)
      parts.push(`${num(Math.max(0, r.elapsedMeter))} ${unit} since last service`);
    if (r.remainingMeter !== null)
      parts.push(
        r.remainingMeter <= 0
          ? `${num(Math.abs(r.remainingMeter))} ${unit} over`
          : `due in ${num(r.remainingMeter)} ${unit}`,
      );
  } else if (r.elapsedDays !== null || r.remainingDays !== null) {
    if (r.elapsedDays !== null) parts.push(`${r.elapsedDays} d since last service`);
    if (r.remainingDays !== null)
      parts.push(
        r.remainingDays <= 0 ? `overdue since ${r.nextDueDate}` : `due in ${r.remainingDays} d`,
      );
  } else if (r.nextDueDate !== null) {
    parts.push(`due ${r.nextDueDate}`);
  }

  return {
    every: every.length > 0 ? `every ${every.join(" or ")}` : null,
    due: parts.length > 0 ? parts.join(" · ") : null,
  };
}

/**
 * The block header's answer to "how far to next service?" — computed from
 * the most urgent task (tasks arrive urgency-sorted from the engine route).
 */
export function nextServiceHeadline(
  tasks: TaskWithDue[],
  unit: "mi" | "h" | null,
): { text: string; status: TaskWithDue["due"]["status"] } | null {
  for (const t of tasks) {
    const r = t.due;
    if (unit !== null && r.remainingMeter !== null)
      return {
        text:
          r.remainingMeter <= 0
            ? `${num(Math.abs(r.remainingMeter))} ${unit} overdue`
            : `Next service in ${num(r.remainingMeter)} ${unit}`,
        status: r.status,
      };
    if (r.remainingDays !== null)
      return {
        text:
          r.remainingDays <= 0
            ? `Overdue since ${r.nextDueDate}`
            : `Next service in ${r.remainingDays} d`,
        status: r.status,
      };
  }
  return null;
}

/** The headline chip: status-colored, the equipment block's one answer. */
export function DueHeadlineChip({
  tasks,
  unit,
}: {
  tasks: TaskWithDue[];
  unit: "mi" | "h" | null;
}) {
  const headline = nextServiceHeadline(tasks, unit);
  if (headline === null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        CHIP[headline.status].className,
      )}
      data-testid="dash-headline"
    >
      {headline.text}
    </span>
  );
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
