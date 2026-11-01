import {
	type CalendarUnit,
	type EquipmentDto,
	evaluateTask,
	formatMeter,
	parseMeterToTenths,
	type SettingsDto,
} from "@mt/shared";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatMeterWithUnit, groupThousands } from "../lib/format";
import { type TaskWithStatus, usePresets, useWrite } from "../lib/hooks";
import { Button } from "./ui/button";
import { Alert } from "./ui/card";
import { Dialog, DialogContent, DialogFooter } from "./ui/dialog";
import { Field, Input, Label, Textarea } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";

const UNITS: Array<{ value: CalendarUnit; label: string }> = [
	{ value: "days", label: "days" },
	{ value: "weeks", label: "weeks" },
	{ value: "months", label: "months" },
	{ value: "years", label: "years" },
];

/**
 * Create a task or edit an existing task's intervals. The preview recalculates
 * next-due values from the last service/baseline as you type — changes apply
 * prospectively; history is never touched.
 */
export function TaskDialog({
	open,
	onClose,
	equipment,
	existing,
	settings,
}: {
	open: boolean;
	onClose: () => void;
	equipment: EquipmentDto;
	existing?: TaskWithStatus | null;
	settings: SettingsDto;
}) {
	const presets = usePresets();
	const task = existing?.task;
	const status = existing?.status ?? null;

	const [name, setName] = useState(task?.name ?? "");
	const [description, setDescription] = useState(task?.description ?? "");
	const [presetId, setPresetId] = useState<string | null>(task?.presetId ?? null);
	const [meterEnabled, setMeterEnabled] = useState(
		task?.meterEnabled ?? equipment.meterKind !== "none",
	);
	const [meterInterval, setMeterInterval] = useState(
		task?.meterInterval != null ? formatMeter(task.meterInterval) : "",
	);
	const [calendarEnabled, setCalendarEnabled] = useState(task?.calendarEnabled ?? false);
	const [calendarValue, setCalendarValue] = useState(task?.calendarValue?.toString() ?? "");
	const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>(
		(task?.calendarUnit as CalendarUnit | null) ?? "months",
	);
	const [baselineDate, setBaselineDate] = useState("");
	const [baselineMeter, setBaselineMeter] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Reset form state when the dialog target changes.
	useEffect(() => {
		if (!open) return;
		setName(task?.name ?? "");
		setDescription(task?.description ?? "");
		setMeterEnabled(task?.meterEnabled ?? equipment.meterKind !== "none");
		setMeterInterval(task?.meterInterval != null ? formatMeter(task.meterInterval) : "");
		setCalendarEnabled(task?.calendarEnabled ?? false);
		setCalendarValue(task?.calendarValue?.toString() ?? "");
		setCalendarUnit((task?.calendarUnit as CalendarUnit | null) ?? "months");
	}, [open, task, equipment.meterKind]);

	const hasMeter = equipment.meterKind !== "none";
	const tenths = meterInterval.trim() === "" ? null : parseMeterToTenths(meterInterval);
	const calValueNum = calendarValue.trim() === "" ? null : Number.parseInt(calendarValue, 10);

	const previewInput = (overridesInterval: number | null) =>
		evaluateTask({
			meterKind: equipment.meterKind,
			currentMeter: equipment.currentMeter,
			task: {
				meterEnabled,
				meterInterval: overridesInterval,
				calendarEnabled,
				calendarValue: calValueNum,
				calendarUnit: calendarEnabled ? calendarUnit : null,
				lastServiceDate: status?.lastServiceDate ?? (baselineDate || null),
				lastServiceMeter:
					status?.lastServiceMeter ??
					(baselineMeter.trim() ? parseMeterToTenths(baselineMeter) : null),
			},
			today: new Date().toISOString().slice(0, 10),
			warnMiles: settings.warnMiles,
			warnHours: settings.warnHours,
			warnDays: settings.warnDays,
		});

	const current = existing ? previewInput(task?.meterInterval ?? null) : null;
	const next = previewInput(tenths);

	const applyPreset = (id: string) => {
		const preset = (presets.data ?? []).find((p) => p.id === id);
		setPresetId(id);
		if (!preset) return;
		if (!name) setName(preset.name);
		if (preset.suggestMeterInterval != null && !meterInterval) {
			setMeterEnabled(true);
			setMeterInterval(formatMeter(preset.suggestMeterInterval));
		}
		if (preset.suggestCalendarValue != null && !calendarValue) {
			setCalendarEnabled(true);
			setCalendarValue(String(preset.suggestCalendarValue));
			if (preset.suggestCalendarUnit) setCalendarUnit(preset.suggestCalendarUnit as CalendarUnit);
		}
	};

	const save = useWrite(
		async () => {
			const body = {
				name: name.trim(),
				description: description.trim() || null,
				enabled: true,
				meterEnabled,
				meterInterval: tenths,
				calendarEnabled,
				calendarValue: calendarEnabled ? calValueNum : null,
				calendarUnit: calendarEnabled ? calendarUnit : null,
			};
			if (existing) {
				return api.patch(`/api/tasks/${task?.id}`, body);
			}
			return api.post(`/api/equipment/${equipment.id}/tasks`, {
				...body,
				presetId,
				baselineDate: baselineDate || null,
				baselineMeter: baselineMeter.trim() ? parseMeterToTenths(baselineMeter) : null,
			});
		},
		{ onDone: onClose },
	);

	const formInvalid =
		!name.trim() ||
		(meterEnabled && (tenths === null || tenths <= 0)) ||
		(calendarEnabled &&
			(calValueNum === null || !Number.isInteger(calValueNum) || calValueNum <= 0)) ||
		(!meterEnabled && !calendarEnabled);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title={existing ? `Edit interval — ${task?.name}` : "New maintenance task"}>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						save.mutate();
					}}
				>
					{!existing && (presets.data?.length ?? 0) > 0 && (
						<Field
							label="Preset suggestion (optional)"
							hint="Suggestions only — nothing is manufacturer-approved."
						>
							<Select value={presetId ?? undefined} onValueChange={applyPreset}>
								<SelectTrigger className="bg-background">
									<SelectValue placeholder="Pick a preset to prefill…" />
								</SelectTrigger>
								<SelectContent>
									{(presets.data ?? []).map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					)}
					<Field label="Task name">
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Oil Change"
						/>
					</Field>
					{!existing && (
						<Field label="Description">
							<Textarea
								rows={2}
								value={description}
								onChange={(e) => setDescription(e.target.value)}
							/>
						</Field>
					)}

					{hasMeter && (
						<div className="rounded-lg border border-border p-3">
							<div className="flex items-center justify-between">
								<Label className="text-foreground">
									Every {groupThousands(meterInterval || "…")}{" "}
									{equipment.meterKind === "hours" ? "hours" : "miles"}
								</Label>
								<Switch checked={meterEnabled} onCheckedChange={setMeterEnabled} />
							</div>
							{meterEnabled && (
								<div className="mt-3">
									<Input
										inputMode="decimal"
										value={meterInterval}
										placeholder={equipment.meterKind === "hours" ? "50" : "5000"}
										onChange={(e) => setMeterInterval(e.target.value)}
									/>
									{meterInterval.trim() !== "" && tenths === null && (
										<p className="mt-1 text-xs text-destructive">
											Number with at most one decimal.
										</p>
									)}
								</div>
							)}
						</div>
					)}

					<div className="rounded-lg border border-border p-3">
						<div className="flex items-center justify-between">
							<Label className="text-foreground">
								Every {calendarValue || "…"} {calendarUnit}
							</Label>
							<Switch checked={calendarEnabled} onCheckedChange={setCalendarEnabled} />
						</div>
						{calendarEnabled && (
							<div className="mt-3 grid grid-cols-2 gap-2">
								<Input
									inputMode="numeric"
									value={calendarValue}
									placeholder="12"
									onChange={(e) => setCalendarValue(e.target.value)}
								/>
								<Select
									value={calendarUnit}
									onValueChange={(u) => setCalendarUnit(u as CalendarUnit)}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{UNITS.map((u) => (
											<SelectItem key={u.value} value={u.value}>
												{u.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>

					{!existing && (
						<div className="rounded-lg border border-dashed border-border p-3">
							<p className="mb-2 text-sm font-medium">
								Baseline — when was this last done?{" "}
								<span className="text-muted-foreground">(optional)</span>
							</p>
							<div className="grid grid-cols-2 gap-2">
								<Input
									type="date"
									aria-label="Baseline date"
									value={baselineDate}
									onChange={(e) => setBaselineDate(e.target.value)}
								/>
								{hasMeter && (
									<Input
										inputMode="decimal"
										placeholder={`Last ${equipment.meterKind === "hours" ? "hours" : "miles"}`}
										value={baselineMeter}
										onChange={(e) => setBaselineMeter(e.target.value)}
									/>
								)}
							</div>
							<p className="mt-2 text-xs text-muted-foreground">
								Without a baseline the task shows “Needs baseline” until you record service.
							</p>
						</div>
					)}

					{/* Old vs new preview */}
					<div className="rounded-lg bg-muted/60 p-3 text-sm">
						<p className="mb-1 font-medium">Next due preview</p>
						{existing && current && (
							<p className="text-muted-foreground">
								Now: {describePreview(current, equipment.meterKind)}
							</p>
						)}
						<p>After save: {describePreview(next, equipment.meterKind)}</p>
						{existing && (
							<p className="mt-1 text-xs text-muted-foreground">
								Changes apply going forward from the last recorded service — history is never
								rewritten.
							</p>
						)}
					</div>

					{!meterEnabled && !calendarEnabled ? (
						<Alert variant="error">Enable at least one schedule dimension.</Alert>
					) : null}
					{save.error ? <Alert variant="error">{(save.error as Error).message}</Alert> : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending || formInvalid}>
							{save.isPending ? "Saving…" : existing ? "Save interval" : "Create task"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function describePreview(result: ReturnType<typeof evaluateTask>, kind: string): string {
	const parts: string[] = [];
	if (result.meter.nextDueMeter !== null) {
		parts.push(
			`${formatMeterWithUnit(result.meter.nextDueMeter, kind)}${result.meter.remainingMeter !== null ? ` (${formatSigned(result.meter.remainingMeter)})` : ""}`,
		);
	}
	if (result.calendar.nextDueDate !== null) {
		parts.push(
			`${result.calendar.nextDueDate}${result.calendar.remainingDays !== null ? ` (${result.calendar.remainingDays}d)` : ""}`,
		);
	}
	if (parts.length === 0) return "unknown until a baseline is set";
	return `${parts.join(" or ")} — ${result.status.replace("_", " ")}`;
}

function formatSigned(tenths: number): string {
	return tenths < 0
		? `${groupThousands(formatMeter(Math.abs(tenths)))} over`
		: `${groupThousands(formatMeter(tenths))} left`;
}
