import { formatMeter, parseMeterToTenths, todayLocalDate } from "@mt/shared";
import { useState } from "react";
import { ApiClientError, api } from "../lib/api";
import { useTasks, useWrite } from "../lib/hooks";
import { Button } from "./ui/button";
import { Alert } from "./ui/card";
import { Dialog, DialogContent, DialogFooter } from "./ui/dialog";
import { Field, Input, Textarea } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** Record (or backfill) a service event; meter required for meter-based tasks. */
export function RecordServiceDialog({
	open,
	onClose,
	equipmentId,
	defaultTaskId,
	currentMeter,
	meterKind,
}: {
	open: boolean;
	onClose: () => void;
	equipmentId: string;
	defaultTaskId?: string | null;
	currentMeter: number | null;
	meterKind: string;
}) {
	const tasksQuery = useTasks(equipmentId);
	const all = tasksQuery.data ?? [];
	const active = all.filter((t) => t.task.enabled);
	const [taskId, setTaskId] = useState<string | null>(defaultTaskId ?? null);
	const selected =
		active.find((t) => t.task.id === taskId) ??
		(defaultTaskId ? active.find((t) => t.task.id === defaultTaskId) : undefined) ??
		active[0];
	const meterRequired = selected?.task.meterEnabled ?? false;
	const [date, setDate] = useState(() => todayLocalDate());
	const [meter, setMeter] = useState(() =>
		currentMeter !== null ? formatMeter(currentMeter) : "",
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
				`/api/equipment/${equipmentId}/events`,
				{
					taskId: selected?.task.id ?? null,
					label: selected?.task.name ?? "Maintenance",
					performedOn: date,
					meter: meter.trim() === "" ? null : parseMeterToTenths(meter),
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

	const meterInvalid = meter.trim() !== "" && parseMeterToTenths(meter) === null;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title="Record maintenance">
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						if (meterRequired && meter.trim() === "") {
							setError("A meter reading is required for this task's schedule.");
							return;
						}
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
						<Field
							label={meterRequired ? "Meter reading (required)" : "Meter reading (optional)"}
							error={meterInvalid ? "Number with at most one decimal (e.g., 127.5)" : undefined}
						>
							<Input
								inputMode="decimal"
								value={meter}
								placeholder={selected?.task.meterEnabled ? "12,345" : "—"}
								onChange={(e) => setMeter(e.target.value)}
							/>
						</Field>
					</div>
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
					{warning ? (
						<Alert variant="warning">
							Saved with a note: {warning} Your record was kept — review the other entry if it looks
							wrong.
						</Alert>
					) : null}
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
