import { formatMeter, parseMeterToTenths, todayLocalDate } from "@mt/shared";
import { useState } from "react";
import { ApiClientError, api } from "../lib/api";
import { type EquipmentLite, useTasks, useWrite } from "../lib/hooks";
import { Button } from "./ui/button";
import { Alert } from "./ui/card";
import { Dialog, DialogContent, DialogFooter } from "./ui/dialog";
import { Field, Input, Textarea } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** Quick "update odometer / hour meter" from the dashboard. */
export function UpdateReadingDialog({
	open,
	onClose,
	equipment,
}: {
	open: boolean;
	onClose: () => void;
	equipment: EquipmentLite;
}) {
	const [miles, setMiles] = useState(() =>
		equipment.currentMiles !== null ? formatMeter(equipment.currentMiles) : "",
	);
	const [hours, setHours] = useState(() =>
		equipment.currentHours !== null ? formatMeter(equipment.currentHours) : "",
	);
	const parse = (v: string) => (v.trim() === "" ? null : parseMeterToTenths(v));
	const milesTenths = parse(miles);
	const hoursTenths = parse(hours);
	const invalid =
		(miles.trim() !== "" && milesTenths === null) || (hours.trim() !== "" && hoursTenths === null);
	const unitDirty = (current: number | null, next: number | null, text: string) =>
		next !== null && next !== current && text.trim() !== "";
	const milesDirty = equipment.hasMiles && unitDirty(equipment.currentMiles, milesTenths, miles);
	const hoursDirty = equipment.hasHours && unitDirty(equipment.currentHours, hoursTenths, hours);
	// Unchanged prefilled value = explicit confirmation the reading is current.
	const milesConfirm =
		equipment.hasMiles && milesTenths !== null && milesTenths === equipment.currentMiles;
	const hoursConfirm =
		equipment.hasHours && hoursTenths !== null && hoursTenths === equipment.currentHours;
	const nothingChanged = !milesDirty && !hoursDirty && !milesConfirm && !hoursConfirm;

	const save = useWrite(
		async () => {
			const posts: Array<Promise<unknown>> = [];
			const post = (
				kind: "miles" | "hours",
				changed: boolean,
				confirmed: boolean,
				value: number | null,
			) => {
				if (!changed && !confirmed) return;
				posts.push(
					api.post(`/api/equipment/${equipment.id}/reading`, {
						kind,
						mode: changed ? "increase" : "confirm",
						...(changed ? { value } : {}),
					}),
				);
			};
			post("miles", milesDirty, milesConfirm, milesTenths);
			post("hours", hoursDirty, hoursConfirm, hoursTenths);
			await Promise.all(posts);
		},
		{ onDone: () => onClose() },
	);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title={`Update ${equipment.name}`}>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						save.mutate();
					}}
				>
					{equipment.hasMiles && (
						<Field
							label="Current miles"
							hint="Decreases are rejected here; fix mistakes from the equipment Info tab."
						>
							<Input
								inputMode="decimal"
								autoFocus
								value={miles}
								onChange={(e) => setMiles(e.target.value)}
							/>
						</Field>
					)}
					{equipment.hasHours && (
						<Field label="Current hours">
							<Input
								inputMode="decimal"
								autoFocus={!equipment.hasMiles}
								value={hours}
								onChange={(e) => setHours(e.target.value)}
							/>
						</Field>
					)}
					{nothingChanged && (
						<p className="text-xs text-muted-foreground">
							Leave a value unchanged to confirm it, or enter the new reading.
						</p>
					)}
					{invalid ? <Alert variant="error">Enter a valid number.</Alert> : null}
					{save.error ? (
						<Alert variant="error">
							{save.error instanceof ApiClientError ? save.error.message : "Could not save."}
						</Alert>
					) : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending || invalid || nothingChanged}>
							{save.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Record (or backfill) a service event; each clock's reading is optional. */
export function RecordServiceDialog({
	open,
	onClose,
	equipment,
	defaultTaskId,
}: {
	open: boolean;
	onClose: () => void;
	equipment: EquipmentLite;
	defaultTaskId?: string | null;
}) {
	const tasksQuery = useTasks(equipment.id);
	const all = tasksQuery.data ?? [];
	const active = all.filter((t) => t.task.enabled);
	const [taskId, setTaskId] = useState<string | null>(defaultTaskId ?? null);
	const selected =
		active.find((t) => t.task.id === taskId) ??
		(defaultTaskId ? active.find((t) => t.task.id === defaultTaskId) : undefined) ??
		active[0];
	const [date, setDate] = useState(() => todayLocalDate());
	// Prefill with the current readings — like copying numbers off a service
	// ticket. Clearing a field leaves that clock untouched (server warns).
	const [milesAtService, setMilesAtService] = useState(() =>
		equipment.currentMiles !== null ? formatMeter(equipment.currentMiles) : "",
	);
	const [hoursAtService, setHoursAtService] = useState(() =>
		equipment.currentHours !== null ? formatMeter(equipment.currentHours) : "",
	);
	const [notes, setNotes] = useState("");
	const [cost, setCost] = useState("");
	const [provider, setProvider] = useState("");
	const [parts, setParts] = useState("");
	const [photos, setPhotos] = useState<File[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [warning, setWarning] = useState<string | null>(null);

	const save = useWrite(
		async () => {
			const result = await api.post<{ event: { id: string }; warning: string | null }>(
				`/api/equipment/${equipment.id}/events`,
				{
					taskId: selected?.task.id ?? null,
					label: selected?.task.name ?? "Maintenance",
					performedOn: date,
					meterMiles: milesAtService.trim() === "" ? null : parseMeterToTenths(milesAtService),
					meterHours: hoursAtService.trim() === "" ? null : parseMeterToTenths(hoursAtService),
					notes: notes.trim() || null,
					serviceProvider: provider.trim() || null,
					costCents: cost.trim() === "" ? null : Math.round(Number.parseFloat(cost) * 100),
					partsUsed: parts.trim() || null,
				},
			);
			// Attach photos after the event exists; failures still keep the record.
			for (const file of photos) {
				await api.upload(`/api/events/${result.event.id}/attachments`, file);
			}
			return result;
		},
		{
			onDone: (data) => {
				if (data.warning) setWarning(data.warning);
				else onClose();
			},
		},
	);

	const parse = (v: string) => (v.trim() === "" ? null : parseMeterToTenths(v));
	const meterInvalid =
		(milesAtService.trim() !== "" && parse(milesAtService) === null) ||
		(hoursAtService.trim() !== "" && parse(hoursAtService) === null);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title="Record maintenance">
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						save.mutate();
					}}
				>
					<Field label="Task">
						{active.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								This equipment has no active tasks yet.
							</p>
						) : (
							<Select value={selected?.task.id} onValueChange={setTaskId}>
								<SelectTrigger>
									<SelectValue placeholder="Choose a task" />
								</SelectTrigger>
								<SelectContent>
									{active.map((t) => (
										<SelectItem key={t.task.id} value={t.task.id}>
											{t.task.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label="Date performed">
							<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
						</Field>
						{equipment.hasMiles && (
							<Field
								label="Miles at service"
								error={
									milesAtService.trim() !== "" && parse(milesAtService) === null
										? "Number with at most one decimal (e.g., 12345.5)"
										: undefined
								}
							>
								<Input
									inputMode="decimal"
									value={milesAtService}
									placeholder="—"
									onChange={(e) => setMilesAtService(e.target.value)}
								/>
							</Field>
						)}
						{equipment.hasHours && (
							<Field
								label="Hours at service"
								error={
									hoursAtService.trim() !== "" && parse(hoursAtService) === null
										? "Number with at most one decimal (e.g., 127.5)"
										: undefined
								}
							>
								<Input
									inputMode="decimal"
									value={hoursAtService}
									placeholder="—"
									onChange={(e) => setHoursAtService(e.target.value)}
								/>
							</Field>
						)}
					</div>
					{(selected?.task.milesEnabled || selected?.task.hoursEnabled) && (
						<p className="-mt-2 text-xs text-muted-foreground">
							Clear a reading to leave that schedule where it is — only the clocks you fill in
							restart.
						</p>
					)}
					<Field label="Notes">
						<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label="Cost (USD)">
							<Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
						</Field>
						<Field label="Service provider">
							<Input value={provider} onChange={(e) => setProvider(e.target.value)} />
						</Field>
					</div>
					<Field label="Parts used">
						<Input value={parts} onChange={(e) => setParts(e.target.value)} />
					</Field>
					<Field
						label="Photos (optional)"
						hint="PNG, JPEG, GIF, WebP images attach to this record."
					>
						<input
							type="file"
							multiple
							accept="image/png,image/jpeg,image/gif,image/webp"
							onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
							className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1 file:text-xs"
						/>
						{photos.length > 0 && (
							<p className="text-xs text-muted-foreground">
								{photos.length} file{photos.length > 1 ? "s" : ""} selected
							</p>
						)}
					</Field>
					{error ? <Alert variant="error">{error}</Alert> : null}
					{save.error ? (
						<Alert variant="error">
							{save.error instanceof ApiClientError ? save.error.message : "Save failed"}
						</Alert>
					) : null}
					{warning ? <Alert variant="warning">Saved with a note: {warning}</Alert> : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending || !date || meterInvalid}>
							{save.isPending ? "Saving…" : "Save service"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function ConfirmDialog({
	open,
	onClose,
	title,
	description,
	confirmLabel,
	destructive,
	onConfirm,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	description: string;
	confirmLabel: string;
	destructive?: boolean;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title={title} className="max-w-sm">
				<p className="text-sm text-muted-foreground">{description}</p>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						onClick={() => {
							onConfirm();
							onClose();
						}}
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
