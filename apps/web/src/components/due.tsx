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
