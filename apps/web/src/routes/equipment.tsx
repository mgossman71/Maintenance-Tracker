import type { EquipmentDto, EventDto } from "@mt/shared";
import { formatMeter, parseMeterToTenths } from "@mt/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight, FileText, Pencil, Plus, Upload, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog, RecordServiceDialog } from "../components/dialogs";
import { TaskDialog } from "../components/task-dialog";
import { Button } from "../components/ui/button";
import { Badge, Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "../components/ui/dialog";
import { Field, Input, Textarea } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ApiClientError, api } from "../lib/api";
import {
	formatDate,
	formatMeterWithUnit,
	formatMoney,
	STATUS_BADGE,
	STATUS_LABEL,
} from "../lib/format";
import {
	useDocuments,
	useEquipment,
	useEquipmentDetail,
	useEvents,
	useSettings,
	useTasks,
	useWrite,
} from "../lib/hooks";

const CATEGORIES = [
	"Truck",
	"Car",
	"Motorcycle",
	"ATV",
	"Dirt Bike",
	"Boat",
	"Outboard",
	"Lawn Mower",
	"Snow Blower",
	"Generator",
	"Other",
];

// ---------------------------------------------------------------------------
// Equipment list
// ---------------------------------------------------------------------------

export function EquipmentListPage() {
	const navigate = useNavigate();
	const [showArchived, setShowArchived] = useState(false);
	const equipment = useEquipment(showArchived);
	const [creating, setCreating] = useState(false);
	const query = useState("");

	const items = useMemo(
		() =>
			(equipment.data ?? []).filter((e) =>
				query[0]
					? `${e.name} ${e.make ?? ""} ${e.model ?? ""}`
							.toLowerCase()
							.includes(query[0].toLowerCase())
					: true,
			),
		[equipment.data, query[0]],
	);

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Equipment</h1>
				<Button size="sm" onClick={() => setCreating(true)}>
					<Plus /> Add equipment
				</Button>
			</div>
			<div className="flex items-center gap-3">
				<Input
					placeholder="Search equipment…"
					value={query[0]}
					onChange={(e) => query[1](e.target.value)}
					className="max-w-xs"
				/>
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={showArchived}
						onChange={(e) => setShowArchived(e.target.checked)}
					/>
					Show archived
				</label>
			</div>

			{equipment.isPending ? <p className="text-muted-foreground">Loading…</p> : null}
			{!equipment.isPending && items.length === 0 && (
				<Card>
					<CardContent className="py-8 text-center text-muted-foreground">
						{query[0]
							? "No equipment matches your search."
							: "No equipment yet. Add a vehicle or machine to get started."}
					</CardContent>
				</Card>
			)}
			{items.map((item) => (
				<Card
					key={item.id}
					className="cursor-pointer transition-colors hover:bg-muted/50"
					onClick={() =>
						navigate({ to: "/equipment/$equipmentId", params: { equipmentId: item.id } })
					}
				>
					<CardContent className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
								<Wrench className="size-4 text-primary" />
							</div>
							<div className="min-w-0">
								<p className="truncate font-medium">
									{item.name}
									{item.archivedAt ? (
										<Badge variant="disabled" className="ml-2">
											Archived
										</Badge>
									) : null}
								</p>
								<p className="text-sm text-muted-foreground">
									{[item.year, item.make, item.model].filter(Boolean).join(" ") ||
										item.category ||
										"—"}
									{item.currentMeter !== null && (
										<>
											{" · "}
											{formatMeterWithUnit(item.currentMeter, item.meterKind)}
										</>
									)}
								</p>
							</div>
						</div>
						<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
					</CardContent>
				</Card>
			))}

			{creating && <EquipmentDialog open onClose={() => setCreating(false)} />}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Equipment detail
// ---------------------------------------------------------------------------

export function EquipmentDetailPage() {
	const { equipmentId } = useParams({ from: "/equipment/$equipmentId" });
	const detail = useEquipmentDetail(equipmentId);
	const [editing, setEditing] = useState(false);

	if (detail.isPending) return <p className="text-muted-foreground">Loading…</p>;
	if (detail.error || !detail.data)
		return (
			<div>
				<Alert2 message="Equipment not found." />
				<Button variant="outline" onClick={() => history.back()}>
					Go back
				</Button>
			</div>
		);
	const equipment = detail.data;

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h1 className="text-xl font-semibold">{equipment.name}</h1>
					<p className="text-sm text-muted-foreground">
						{[equipment.year, equipment.make, equipment.model].filter(Boolean).join(" ") ||
							equipment.category ||
							""}
						{equipment.currentMeter !== null && (
							<>
								{" · "}
								{formatMeterWithUnit(equipment.currentMeter, equipment.meterKind)}
							</>
						)}
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
					<Pencil /> Edit
				</Button>
			</div>

			<Tabs defaultValue="tasks">
				<TabsList>
					<TabsTrigger value="tasks">Tasks</TabsTrigger>
					<TabsTrigger value="history">History</TabsTrigger>
					<TabsTrigger value="documents">Documents</TabsTrigger>
					<TabsTrigger value="info">Info</TabsTrigger>
				</TabsList>
				<TabsContent value="tasks">
					<TasksTab equipment={equipment} />
				</TabsContent>
				<TabsContent value="history">
					<HistoryTab equipment={equipment} />
				</TabsContent>
				<TabsContent value="documents">
					<DocumentsTab equipment={equipment} />
				</TabsContent>
				<TabsContent value="info">
					<InfoTab equipment={equipment} />
				</TabsContent>
			</Tabs>

			{editing && <EquipmentDialog open equipment={equipment} onClose={() => setEditing(false)} />}
		</div>
	);
}

function Alert2({ message }: { message: string }) {
	return <p className="mb-3 text-destructive">{message}</p>;
}

// --- Tasks tab ---------------------------------------------------------------

function TasksTab({ equipment }: { equipment: EquipmentDto }) {
	const tasks = useTasks(equipment.id);
	const settings = useSettings();
	const [creating, setCreating] = useState(false);
	const [editingTask, setEditingTask] = useState<string | null>(null);
	const [deletingTask, setDeletingTask] = useState<string | null>(null);
	const [recordTask, setRecordTask] = useState<string | null>(null);

	const removeTask = useWrite(() => api.delete(`/api/tasks/${deletingTask}`));
	const toggleTask = useWrite((vars: { id: string; enabled: boolean }) =>
		api.patch(`/api/tasks/${vars.id}`, { enabled: vars.enabled }),
	);

	if (tasks.isPending) return <p className="text-muted-foreground">Loading tasks…</p>;
	const list = tasks.data ?? [];
	const editing = editingTask ? (list.find((t) => t.task.id === editingTask) ?? null) : null;

	return (
		<div className="grid gap-2">
			<div className="flex justify-end">
				<Button size="sm" onClick={() => setCreating(true)}>
					<Plus /> New task
				</Button>
			</div>
			{list.length === 0 && (
				<Card>
					<CardContent className="py-8 text-center text-muted-foreground">
						No maintenance tasks yet. Create one — for example “Oil Change every 5,000 miles”.
					</CardContent>
				</Card>
			)}
			{list.map(({ task, status }) => (
				<Card key={task.id} className={task.enabled ? "" : "opacity-60"}>
					<CardContent>
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium">{task.name}</span>
									<Badge
										variant={task.enabled ? (STATUS_BADGE[status.status] ?? "neutral") : "disabled"}
									>
										{task.enabled ? STATUS_LABEL[status.status] : "Disabled"}
									</Badge>
								</div>
								<p className="mt-0.5 text-sm text-muted-foreground">{status.scheduleSummary}</p>
								<p className="mt-1 text-sm">
									{status.meter.nextDueMeter !== null && (
										<>
											Due at{" "}
											<span className="font-medium">
												{formatMeterWithUnit(status.meter.nextDueMeter, equipment.meterKind)}
											</span>{" "}
										</>
									)}
									{status.calendar.nextDueDate !== null && (
										<>
											{status.meter.nextDueMeter !== null ? "or " : "Due "}
											<span className="font-medium">{formatDate(status.calendar.nextDueDate)}</span>
										</>
									)}
									{status.lastServiceDate && (
										<span className="text-muted-foreground">
											{"  "}· last done {formatDate(status.lastServiceDate)}
											{status.lastServiceMeter !== null &&
												` at ${formatMeterWithUnit(status.lastServiceMeter, equipment.meterKind)}`}
										</span>
									)}
								</p>
								{status.explanation ? (
									<p className="mt-1 text-xs text-warning">{status.explanation}</p>
								) : null}
							</div>
							<div className="flex flex-wrap gap-1.5 sm:shrink-0 lg:justify-end">
								<Button size="sm" disabled={!task.enabled} onClick={() => setRecordTask(task.id)}>
									Record maintenance
								</Button>
								<Button size="sm" variant="outline" onClick={() => setEditingTask(task.id)}>
									Edit interval
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => toggleTask.mutate({ id: task.id, enabled: !task.enabled })}
								>
									{task.enabled ? "Disable" : "Enable"}
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setDeletingTask(task.id)}>
									Delete
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			))}

			{creating && settings.data && (
				<TaskDialog
					open
					onClose={() => setCreating(false)}
					equipment={equipment}
					settings={settings.data}
				/>
			)}
			{editing && settings.data && (
				<TaskDialog
					open
					onClose={() => setEditingTask(null)}
					equipment={equipment}
					existing={editing}
					settings={settings.data}
				/>
			)}
			<ConfirmDialog
				open={Boolean(deletingTask)}
				onClose={() => setDeletingTask(null)}
				title="Delete task?"
				description="This removes the task and its service history for this equipment. Other tasks and records are untouched."
				confirmLabel="Delete task"
				destructive
				onConfirm={() => deletingTask && removeTask.mutate()}
			/>
			{recordTask && (
				<RecordServiceDialog
					open
					onClose={() => setRecordTask(null)}
					equipmentId={equipment.id}
					defaultTaskId={recordTask}
					currentMeter={equipment.currentMeter}
					meterKind={equipment.meterKind}
				/>
			)}
		</div>
	);
}

// --- History tab ---------------------------------------------------------------

function HistoryTab({ equipment }: { equipment: EquipmentDto }) {
	const events = useEvents(equipment.id);
	const tasks = useTasks(equipment.id);
	const [filter, setFilter] = useState<string>("all");
	const [deleting, setDeleting] = useState<EventDto | null>(null);
	const [editingEvent, setEditingEvent] = useState<EventDto | null>(null);

	const remove = useWrite(() => api.delete(`/api/events/${deleting?.id}`));

	if (events.isPending) return <p className="text-muted-foreground">Loading history…</p>;
	const list = (events.data ?? []).filter((e) =>
		filter === "all" ? true : filter === "unscheduled" ? !e.taskId : e.taskId === filter,
	);

	return (
		<div className="grid gap-2">
			{tasks.data && tasks.data.length > 0 && (
				<div className="flex justify-end">
					<Select value={filter} onValueChange={setFilter}>
						<SelectTrigger className="w-52">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All history</SelectItem>
							{tasks.data.map((t) => (
								<SelectItem key={t.task.id} value={t.task.id}>
									{t.task.name}
								</SelectItem>
							))}
							<SelectItem value="unscheduled">Unscheduled events</SelectItem>
						</SelectContent>
					</Select>
				</div>
			)}
			{list.length === 0 && (
				<Card>
					<CardContent className="py-8 text-center text-muted-foreground">
						No service records yet. Record maintenance from the Tasks tab.
					</CardContent>
				</Card>
			)}
			{list.map((event) => {
				const taskName = event.taskId
					? (tasks.data?.find((t) => t.task.id === event.taskId)?.task.name ?? "task")
					: "Unscheduled";
				return (
					<Card key={event.id}>
						<CardContent className="flex flex-wrap items-start justify-between gap-2">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium">{event.label}</span>
									{event.source === "baseline" ? <Badge variant="unknown">baseline</Badge> : null}
								</div>
								<p className="text-sm text-muted-foreground">
									{formatDate(event.performedOn)}
									{event.meter !== null && (
										<> · {formatMeterWithUnit(event.meter, equipment.meterKind)}</>
									)}
									{" · "}
									{taskName}
									{event.costCents !== null && <> · {formatMoney(event.costCents)}</>}
									{event.serviceProvider && <> · {event.serviceProvider}</>}
								</p>
								{event.notes ? <p className="mt-1 text-sm">{event.notes}</p> : null}
								{event.partsUsed ? (
									<p className="text-xs text-muted-foreground">Parts: {event.partsUsed}</p>
								) : null}
								{(event.attachments?.length ?? 0) > 0 && (
									<div className="mt-2 flex flex-wrap gap-2">
										{event.attachments?.map((att) =>
											SAFE_INLINE_IMAGES.includes(att.mimeType) ? (
												<a
													key={att.id}
													href={`/api/attachments/${att.id}/download`}
													title={att.filename}
												>
													<img
														src={`/api/attachments/${att.id}/download`}
														alt={att.filename}
														className="size-16 rounded-md border border-border object-cover"
													/>
												</a>
											) : (
												<a
													key={att.id}
													href={`/api/attachments/${att.id}/download`}
													download={att.filename}
													className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
												>
													<FileText className="size-3.5" /> {att.filename}
												</a>
											),
										)}
									</div>
								)}
							</div>
							<div className="flex shrink-0 gap-1">
								<Button size="sm" variant="ghost" onClick={() => setEditingEvent(event)}>
									Edit
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setDeleting(event)}>
									Delete
								</Button>
							</div>
						</CardContent>
					</Card>
				);
			})}
			<ConfirmDialog
				open={Boolean(deleting)}
				onClose={() => setDeleting(null)}
				title="Delete service record?"
				description="Due dates recalculate from the next most recent record (or the task's baseline). This cannot be undone."
				confirmLabel="Delete record"
				destructive
				onConfirm={() => deleting && remove.mutate()}
			/>
			{editingEvent && (
				<EditEventDialog
					event={editingEvent}
					onClose={() => setEditingEvent(null)}
					meterKind={equipment.meterKind}
				/>
			)}
		</div>
	);
}

function EditEventDialog({
	event,
	onClose,
	meterKind,
}: {
	event: EventDto;
	onClose: () => void;
	meterKind: string;
}) {
	const [date, setDate] = useState(event.performedOn);
	const [meter, setMeter] = useState(event.meter !== null ? _fmtTenths(event.meter) : "");
	const [notes, setNotes] = useState(event.notes ?? "");
	const [cost, setCost] = useState(event.costCents !== null ? String(event.costCents / 100) : "");
	const [error, setError] = useState<string | null>(null);

	const save = useWrite(
		() =>
			api.patch(`/api/events/${event.id}`, {
				performedOn: date,
				meter: meter.trim() === "" ? null : parseTenths(meter),
				notes: notes.trim() || null,
				costCents: cost.trim() === "" ? null : Math.round(Number.parseFloat(cost) * 100),
			}),
		{ onDone: onClose },
	);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent title="Edit service record" className="max-w-md">
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						save.mutate();
					}}
				>
					<div className="grid grid-cols-2 gap-3">
						<Field label="Date">
							<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
						</Field>
						<Field label={meterKind === "none" ? "Meter" : `Meter (${meterKind})`}>
							<Input inputMode="decimal" value={meter} onChange={(e) => setMeter(e.target.value)} />
						</Field>
					</div>
					<Field label="Cost (USD)">
						<Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
					</Field>
					<Field label="Notes">
						<Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
					</Field>
					{save.error ? (
						<Alert3>
							{save.error instanceof ApiClientError ? save.error.message : "Save failed"}
						</Alert3>
					) : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending}>
							{save.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Alert3({ children }: { children: React.ReactNode }) {
	return <p className="text-sm text-destructive">{children}</p>;
}

// --- Documents tab -----------------------------------------------------------

const SAFE_INLINE_IMAGES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsTab({ equipment }: { equipment: EquipmentDto }) {
	const documents = useDocuments(equipment.id);
	const remove = useWrite((id: string) => api.delete(`/api/documents/${id}`));
	const [error, setError] = useState<string | null>(null);

	const upload = useWrite(async (files: FileList) => {
		setError(null);
		for (const file of Array.from(files)) {
			await api.upload(`/api/equipment/${equipment.id}/documents`, file);
		}
	});

	const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) upload.mutate(e.target.files);
		e.target.value = "";
	};

	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					Manuals, receipts, photos. PNG, JPEG, GIF, WebP, PDF.
				</p>
				<label className="cursor-pointer">
					<span className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
						<Upload className="size-4" /> Upload
					</span>
					<input
						type="file"
						multiple
						accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
						className="sr-only"
						onChange={onFiles}
					/>
				</label>
			</div>
			{upload.error ? (
				<p className="text-sm text-destructive">
					{upload.error instanceof ApiClientError ? upload.error.message : "Upload failed"}
				</p>
			) : null}
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
			{documents.isPending ? <p className="text-muted-foreground">Loading documents…</p> : null}
			{(documents.data ?? []).length === 0 && !documents.isPending && (
				<Card>
					<CardContent className="py-8 text-center text-muted-foreground">
						No documents yet. Upload manuals, receipts, or photos.
					</CardContent>
				</Card>
			)}
			{(documents.data ?? []).map((doc) => (
				<Card key={doc.id}>
					<CardContent className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							{SAFE_INLINE_IMAGES.includes(doc.mimeType) ? (
								<img
									src={`/api/documents/${doc.id}/download`}
									alt={doc.filename}
									className="size-12 rounded-md border border-border object-cover"
								/>
							) : (
								<div className="flex size-12 items-center justify-center rounded-md bg-muted">
									<FileText className="size-5 text-muted-foreground" />
								</div>
							)}
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{doc.filename}</p>
								<p className="text-xs text-muted-foreground">
									{formatBytes(doc.byteLength)} · {formatDate(doc.createdAt)}
								</p>
							</div>
						</div>
						<div className="flex shrink-0 gap-1">
							<Button size="sm" variant="outline" asChild>
								<a href={`/api/documents/${doc.id}/download`} download={doc.filename}>
									Download
								</a>
							</Button>
							<Button size="sm" variant="ghost" onClick={() => remove.mutate(doc.id)}>
								Delete
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// --- Info tab ---------------------------------------------------------------

function InfoTab({ equipment }: { equipment: EquipmentDto }) {
	const [readingMode, setReadingMode] = useState<"increase" | "correction" | null>(null);
	const [readingValue, setReadingValue] = useState("");
	const remove = useWrite(() => api.delete(`/api/equipment/${equipment.id}`), {
		onDone: () => history.back(),
	});
	const archive = useWrite(() =>
		api.patch(`/api/equipment/${equipment.id}`, { archived: !equipment.archivedAt }),
	);

	const confirm = useWrite(() =>
		api.post(`/api/equipment/${equipment.id}/reading`, { mode: "confirm" }),
	);
	const submitReading = useWrite(
		() =>
			api.post(`/api/equipment/${equipment.id}/reading`, {
				mode: readingMode ?? "increase",
				value: parseTenths(readingValue),
			}),
		{ onDone: () => setReadingMode(null) },
	);

	const invalid = readingValue.trim() === "" || parseTenths(readingValue) === null;

	return (
		<div className="grid gap-4">
			<Card>
				<CardContent className="grid gap-1 text-sm">
					<InfoRow label="Type" value={equipment.category ?? "—"} />
					<InfoRow
						label="Make / Model"
						value={[equipment.make, equipment.model].filter(Boolean).join(" ") || "—"}
					/>
					<InfoRow label="Year" value={equipment.year?.toString() ?? "—"} />
					<InfoRow label="Meter" value={equipment.meterKind} />
					<InfoRow
						label="Current reading"
						value={formatMeterWithUnit(equipment.currentMeter, equipment.meterKind)}
					/>
					<InfoRow label="Reading verified" value={formatDate(equipment.meterVerifiedAt)} />
					{equipment.description ? <InfoRow label="Notes" value={equipment.description} /> : null}
				</CardContent>
			</Card>

			{equipment.meterKind !== "none" && (
				<Card>
					<CardContent className="grid gap-2">
						<p className="text-sm font-medium">Meter reading</p>
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								onClick={() => {
									setReadingMode("increase");
									setReadingValue("");
								}}
							>
								Update reading
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={equipment.currentMeter === null}
								onClick={() => confirm.mutate()}
							>
								Confirm same reading
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									setReadingMode("correction");
									setReadingValue("");
								}}
							>
								Correct reading
							</Button>
						</div>
						{submitReading.error ? (
							<p className="text-sm text-destructive">
								{submitReading.error instanceof ApiClientError
									? submitReading.error.message
									: "Save failed"}
							</p>
						) : null}
					</CardContent>
				</Card>
			)}

			<Dialog open={readingMode !== null} onOpenChange={(o) => !o && setReadingMode(null)}>
				<DialogContent
					title={readingMode === "correction" ? "Correct current reading" : "Update reading"}
				>
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							submitReading.mutate();
						}}
					>
						<Field
							label={`Current ${equipment.meterKind}`}
							hint={
								readingMode === "correction"
									? "Corrections are kept in the reading history and never rewrite service records."
									: undefined
							}
						>
							<Input
								inputMode="decimal"
								autoFocus
								value={readingValue}
								onChange={(e) => setReadingValue(e.target.value)}
							/>
						</Field>
						<DialogFooter>
							<Button type="button" variant="ghost" onClick={() => setReadingMode(null)}>
								Cancel
							</Button>
							<Button type="submit" disabled={submitReading.isPending || invalid}>
								Save
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Card>
				<CardContent className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<p className="text-sm font-medium">
							{equipment.archivedAt ? "Archived" : "Archive equipment"}
						</p>
						<p className="text-sm text-muted-foreground">
							Hides from the dashboard and lists. History is preserved; restore anytime.
						</p>
					</div>
					<Button variant="outline" size="sm" onClick={() => archive.mutate()}>
						{equipment.archivedAt ? "Restore" : "Archive"}
					</Button>
				</CardContent>
			</Card>

			<DeleteEquipmentCard
				equipment={equipment}
				onDelete={() => remove.mutate()}
				pending={remove.isPending}
			/>
		</div>
	);
}

function DeleteEquipmentCard({
	equipment,
	onDelete,
	pending,
}: {
	equipment: EquipmentDto;
	onDelete: () => void;
	pending: boolean;
}) {
	const [confirming, setConfirming] = useState(false);
	return (
		<>
			<Card className="border-destructive/30">
				<CardContent className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<p className="text-sm font-medium text-destructive">Delete permanently</p>
						<p className="text-sm text-muted-foreground">
							Removes {equipment.name} with all tasks, readings, and history. Cannot be undone.
						</p>
					</div>
					<Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
						Delete…
					</Button>
				</CardContent>
			</Card>
			<ConfirmDialog
				open={confirming}
				onClose={() => setConfirming(false)}
				title={`Delete ${equipment.name} permanently?`}
				description="This deletes all tasks, service history, readings, and documents for this item. There is no undo. Prefer Archive if you just want it out of the way."
				confirmLabel="Delete everything"
				destructive
				onConfirm={onDelete}
			/>
		</>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium capitalize">{value}</span>
		</div>
	);
}

// --- Equipment create/edit dialog -------------------------------------------

export function EquipmentDialog({
	open,
	onClose,
	equipment,
}: {
	open: boolean;
	onClose: () => void;
	equipment?: EquipmentDto;
}) {
	const [name, setName] = useState(equipment?.name ?? "");
	const [category, setCategory] = useState(equipment?.category ?? "");
	const [make, setMake] = useState(equipment?.make ?? "");
	const [model, setModel] = useState(equipment?.model ?? "");
	const [year, setYear] = useState(equipment?.year?.toString() ?? "");
	const [description, setDescription] = useState(equipment?.description ?? "");
	const [meterKind, setMeterKind] = useState(equipment?.meterKind ?? "miles");
	const [currentMeter, setCurrentMeter] = useState(
		equipment?.currentMeter != null ? _fmtTenths(equipment.currentMeter) : "",
	);
	const [error, setError] = useState<string | null>(null);

	const save = useWrite(
		async () => {
			const body = {
				name: name.trim(),
				category: category || null,
				make: make.trim() || null,
				model: model.trim() || null,
				year: year.trim() === "" ? null : Number.parseInt(year, 10),
				description: description.trim() || null,
			};
			if (equipment) {
				return api.patch(`/api/equipment/${equipment.id}`, { ...body, meterKind });
			}
			return api.post("/api/equipment", {
				...body,
				meterKind,
				currentMeter: currentMeter.trim() === "" ? null : parseTenths(currentMeter),
			});
		},
		{ onDone: onClose },
	);

	const meterInvalid = currentMeter.trim() !== "" && parseTenths(currentMeter) === null;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title={equipment ? "Edit equipment" : "Add equipment"}>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						save.mutate();
					}}
				>
					<Field label="Name" error={error}>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="F-150"
							autoFocus
						/>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label="Type">
							<Select value={category || undefined} onValueChange={setCategory}>
								<SelectTrigger>
									<SelectValue placeholder="Choose type" />
								</SelectTrigger>
								<SelectContent>
									{CATEGORIES.map((c) => (
										<SelectItem key={c} value={c}>
											{c}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field label="Year">
							<Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
						</Field>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<Field label="Make">
							<Input value={make} onChange={(e) => setMake(e.target.value)} />
						</Field>
						<Field label="Model">
							<Input value={model} onChange={(e) => setModel(e.target.value)} />
						</Field>
					</div>
					{!equipment && (
						<Field
							label="Tracks"
							hint="Miles and hours drive interval schedules; “no meter” is calendar-only."
						>
							<Select
								value={meterKind}
								onValueChange={(v) => setMeterKind(v as EquipmentDto["meterKind"])}
							>
								<SelectTrigger aria-label="Tracks">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="miles">Miles (vehicles)</SelectItem>
									<SelectItem value="hours">Operating hours (machines)</SelectItem>
									<SelectItem value="none">No meter (calendar only)</SelectItem>
								</SelectContent>
							</Select>
						</Field>
					)}
					{meterKind !== "none" && (
						<Field
							label={`Current ${meterKind} (optional)`}
							error={meterInvalid ? "Number with at most one decimal." : undefined}
						>
							<Input
								inputMode="decimal"
								value={currentMeter}
								onChange={(e) => setCurrentMeter(e.target.value)}
								disabled={Boolean(equipment)}
							/>
						</Field>
					)}
					<Field label="Notes">
						<Textarea
							rows={2}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</Field>
					{save.error ? (
						<p className="text-sm text-destructive">
							{save.error instanceof ApiClientError ? save.error.message : "Save failed"}
						</p>
					) : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending || !name.trim() || meterInvalid}>
							{save.isPending ? "Saving…" : equipment ? "Save changes" : "Add equipment"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// helpers

function _fmtTenths(tenths: number): string {
	return formatMeter(tenths);
}
function parseTenths(value: string): number | null {
	return parseMeterToTenths(value);
}
