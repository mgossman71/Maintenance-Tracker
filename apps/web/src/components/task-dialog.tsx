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
 * Create a task or edit an existing task's intervals. A task can be due on
 * miles, hours, and/or calendar — whichever comes first. The preview
 * recalculates next-due values from the last service/baseline as you type;
 * changes apply prospectively, history is never touched.
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

	// When a task carries one meter, its dimension starts enabled; with both
	// meters the mile clock is the conventional primary.
	const defaultMiles = task
		? task.milesEnabled
		: equipment.hasMiles && (!equipment.hasHours || equipment.hasMiles);
	const defaultHours = task ? task.hoursEnabled : equipment.hasHours && !equipment.hasMiles;

	const [name, setName] = useState(task?.name ?? "");
	const [description, setDescription] = useState(task?.description ?? "");
	const [presetId, setPresetId] = useState<string | null>(task?.presetId ?? null);
	const [milesEnabled, setMilesEnabled] = useState(defaultMiles);
	const [milesInterval, setMilesInterval] = useState(
		task?.milesInterval != null ? formatMeter(task.milesInterval) : "",
	);
	const [hoursEnabled, setHoursEnabled] = useState(defaultHours);
	const [hoursInterval, setHoursInterval] = useState(
		task?.hoursInterval != null ? formatMeter(task.hoursInterval) : "",
	);
	const [calendarEnabled, setCalendarEnabled] = useState(task?.calendarEnabled ?? false);
	const [calendarValue, setCalendarValue] = useState(task?.calendarValue?.toString() ?? "");
	const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>(
		(task?.calendarUnit as CalendarUnit | null) ?? "months",
	);
	const [baselineDate, setBaselineDate] = useState("");
	const [baselineMiles, setBaselineMiles] = useState("");
	const [baselineHours, setBaselineHours] = useState("");

	// Reset form state when the dialog target changes.
	useEffect(() => {
		if (!open) return;
		setName(task?.name ?? "");
		setDescription(task?.description ?? "");
		setMilesEnabled(
			task ? task.milesEnabled : equipment.hasMiles && (!equipment.hasHours || equipment.hasMiles),
		);
		setMilesInterval(task?.milesInterval != null ? formatMeter(task.milesInterval) : "");
		setHoursEnabled(task ? task.hoursEnabled : equipment.hasHours && !equipment.hasMiles);
		setHoursInterval(task?.hoursInterval != null ? formatMeter(task.hoursInterval) : "");
		setCalendarEnabled(task?.calendarEnabled ?? false);
		setCalendarValue(task?.calendarValue?.toString() ?? "");
		setCalendarUnit((task?.calendarUnit as CalendarUnit | null) ?? "months");
	}, [open, task, equipment.hasMiles, equipment.hasHours]);

	const parseTenths = (text: string): number | null =>
		text.trim() === "" ? null : parseMeterToTenths(text);
	const milesTenths = parseTenths(milesInterval);
	const hoursTenths = parseTenths(hoursInterval);
	const calValueNum = calendarValue.trim() === "" ? null : Number.parseInt(calendarValue, 10);

	const previewInput = (overrides: {
		miles: number | null;
		hours: number | null;
		calendar: number | null;
	}) =>
		evaluateTask({
			hasMiles: equipment.hasMiles,
			hasHours: equipment.hasHours,
			currentMiles: equipment.currentMiles,
			currentHours: equipment.currentHours,
			task: {
				milesEnabled,
				milesInterval: overrides.miles,
				hoursEnabled,
				hoursInterval: overrides.hours,
				calendarEnabled,
				calendarValue: overrides.calendar,
				calendarUnit: calendarEnabled ? calendarUnit : null,
				lastServiceDate: status?.lastServiceDate ?? (baselineDate || null),
				lastServiceMiles:
					status?.lastServiceMiles ??
					(baselineMiles.trim() ? parseMeterToTenths(baselineMiles) : null),
				lastServiceHours:
					status?.lastServiceHours ??
					(baselineHours.trim() ? parseMeterToTenths(baselineHours) : null),
			},
			today: new Date().toISOString().slice(0, 10),
			warnMiles: settings.warnMiles,
			warnHours: settings.warnHours,
			warnDays: settings.warnDays,
		});

	const current = existing
		? previewInput({
				miles: task?.milesInterval ?? null,
				hours: task?.hoursInterval ?? null,
				calendar: task?.calendarEnabled ? task.calendarValue : null,
			})
		: null;
	const next = previewInput({
		miles: milesTenths,
		hours: hoursTenths,
		calendar: calendarEnabled ? calValueNum : null,
	});

	const applyPreset = (id: string) => {
		const preset = (presets.data ?? []).find((p) => p.id === id);
		setPresetId(id);
		if (!preset) return;
		if (!name) setName(preset.name);
		if (preset.suggestMeterInterval != null) {
			// Presets carry one suggested interval; it lands on the equipment's
			// primary meter (miles when it has one).
			if (equipment.hasMiles && !milesInterval) {
				setMilesEnabled(true);
				setMilesInterval(formatMeter(preset.suggestMeterInterval));
			} else if (equipment.hasHours && !hoursInterval) {
				setHoursEnabled(true);
				setHoursInterval(formatMeter(preset.suggestMeterInterval));
			}
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
				milesEnabled: equipment.hasMiles ? milesEnabled : false,
				milesInterval: milesEnabled ? milesTenths : null,
				hoursEnabled: equipment.hasHours ? hoursEnabled : false,
				hoursInterval: hoursEnabled ? hoursTenths : null,
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
				baselineMiles: baselineMiles.trim() ? parseMeterToTenths(baselineMiles) : null,
				baselineHours: baselineHours.trim() ? parseMeterToTenths(baselineHours) : null,
			});
		},
		{ onDone: onClose },
	);

	const dimensionInvalid =
		(milesEnabled && (milesTenths === null || milesTenths <= 0)) ||
		(hoursEnabled && (hoursTenths === null || hoursTenths <= 0));
	const formInvalid =
		!name.trim() ||
		dimensionInvalid ||
		(calendarEnabled &&
			(calValueNum === null || !Number.isInteger(calValueNum) || calValueNum <= 0)) ||
		(!milesEnabled && !hoursEnabled && !calendarEnabled);

	const meterSection = (opts: {
		label: string;
		enabled: boolean;
		onEnabled: (v: boolean) => void;
		value: string;
		onValue: (v: string) => void;
		placeholder: string;
		tenths: number | null;
	}) => (
		<div className="rounded-lg border border-border p-3">
			<div className="flex items-center justify-between">
				<Label className="text-foreground">
					Every {opts.value || "…"} {opts.label}
				</Label>
				<Switch
					aria-label={`Enable ${opts.label} interval`}
					checked={opts.enabled}
					onCheckedChange={opts.onEnabled}
				/>
			</div>
			{opts.enabled && (
				<div className="mt-3">
					<Input
						inputMode="decimal"
						value={opts.value}
						placeholder={opts.placeholder}
						onChange={(e) => opts.onValue(e.target.value)}
					/>
					{opts.value.trim() !== "" && opts.tenths === null && (
						<p className="mt-1 text-xs text-destructive">Number with at most one decimal.</p>
					)}
				</div>
			)}
		</div>
	);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title={existing ? `Edit interval — ${task?.name}` : "New maintenance task"}>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
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

					{equipment.hasMiles &&
						meterSection({
							label: "miles",
							enabled: milesEnabled,
							onEnabled: setMilesEnabled,
							value: milesInterval,
							onValue: setMilesInterval,
							placeholder: "5000",
							tenths: milesTenths,
						})}
					{equipment.hasHours &&
						meterSection({
							label: "hours",
							enabled: hoursEnabled,
							onEnabled: setHoursEnabled,
							value: hoursInterval,
							onValue: setHoursInterval,
							placeholder: "50",
							tenths: hoursTenths,
						})}

					<div className="rounded-lg border border-border p-3">
						<div className="flex items-center justify-between">
							<Label className="text-foreground">
								Every {calendarValue || "…"} {calendarUnit}
							</Label>
							<Switch
								aria-label="Enable time interval"
								checked={calendarEnabled}
								onCheckedChange={setCalendarEnabled}
							/>
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
							<div className="grid gap-2 sm:grid-cols-2">
								<Input
									type="date"
									aria-label="Baseline date"
									value={baselineDate}
									onChange={(e) => setBaselineDate(e.target.value)}
								/>
								{equipment.hasMiles && (
									<Input
										inputMode="decimal"
										placeholder="Last miles"
										aria-label="Baseline miles"
										value={baselineMiles}
										onChange={(e) => setBaselineMiles(e.target.value)}
									/>
								)}
								{equipment.hasHours && (
									<Input
										inputMode="decimal"
										placeholder="Last hours"
										aria-label="Baseline hours"
										value={baselineHours}
										onChange={(e) => setBaselineHours(e.target.value)}
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
							<p className="text-muted-foreground">Now: {describePreview(current)}</p>
						)}
						<p>After save: {describePreview(next)}</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Whichever dimension comes first makes the task due.
						</p>
						{existing && (
							<p className="mt-1 text-xs text-muted-foreground">
								Changes apply going forward from the last recorded service — history is never
								rewritten.
							</p>
						)}
					</div>

					{!milesEnabled && !hoursEnabled && !calendarEnabled ? (
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

function describePreview(result: ReturnType<typeof evaluateTask>): string {
	const parts: string[] = [];
	if (result.miles.enabled && result.miles.nextDueMeter !== null) {
		parts.push(
			`${formatMeterWithUnit(result.miles.nextDueMeter, "miles")}${result.miles.remainingMeter !== null ? ` (${formatSigned(result.miles.remainingMeter)})` : ""}`,
		);
	}
	if (result.hours.enabled && result.hours.nextDueMeter !== null) {
		parts.push(
			`${formatMeterWithUnit(result.hours.nextDueMeter, "hours")}${result.hours.remainingMeter !== null ? ` (${formatSigned(result.hours.remainingMeter)})` : ""}`,
		);
	}
	if (result.calendar.enabled && result.calendar.nextDueDate !== null) {
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
