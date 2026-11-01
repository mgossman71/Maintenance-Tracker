import type { EquipmentDto, EventDto, FuelSummary, TaskStatusDto } from "@mt/shared";
import { formatGallons, formatMeter, parseMeterToTenths } from "@mt/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
	ChevronRight,
	FileText,
	Fuel,
	Minus,
	Pencil,
	Plus,
	TrendingDown,
	TrendingUp,
	Upload,
	Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog, RecordServiceDialog } from "../components/dialogs";
import { FuelDialog, type FuelEntry } from "../components/fuel-dialog";
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
	useFuel,
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
									{readingSummary(item)}
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
						{readingSummary(equipment)}
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
					{equipment.hasMiles && <TabsTrigger value="fuel">Fuel</TabsTrigger>}
					<TabsTrigger value="documents">Documents</TabsTrigger>
					<TabsTrigger value="info">Info</TabsTrigger>
				</TabsList>
				<TabsContent value="tasks">
					<TasksTab equipment={equipment} />
				</TabsContent>
				<TabsContent value="history">
					<HistoryTab equipment={equipment} />
				</TabsContent>
				{equipment.hasMiles && (
					<TabsContent value="fuel">
						<FuelTab equipment={equipment} />
					</TabsContent>
				)}
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
								{dueParts(status).length > 0 && (
									<p className="mt-1 text-sm">
										Due <span className="font-medium">{dueParts(status).join(" or ")}</span>
										{status.lastServiceDate && (
											<span className="text-muted-foreground">
												{"  "}· last done {formatDate(status.lastServiceDate)}
												{status.lastServiceMiles !== null &&
													` at ${formatMeterWithUnit(status.lastServiceMiles, "miles")}`}
												{status.lastServiceHours !== null &&
													` / ${formatMeterWithUnit(status.lastServiceHours, "hours")}`}
											</span>
										)}
									</p>
								)}
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
					equipment={equipment}
					defaultTaskId={recordTask}
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
									{event.meterMiles !== null && (
										<> · {formatMeterWithUnit(event.meterMiles, "miles")}</>
									)}
									{event.meterHours !== null && (
										<> · {formatMeterWithUnit(event.meterHours, "hours")}</>
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
					equipment={equipment}
				/>
			)}
		</div>
	);
}

function EditEventDialog({
	event,
	onClose,
	equipment,
}: {
	event: EventDto;
	onClose: () => void;
	equipment: EquipmentDto;
}) {
	const [date, setDate] = useState(event.performedOn);
	const [miles, setMiles] = useState(event.meterMiles !== null ? _fmtTenths(event.meterMiles) : "");
	const [hours, setHours] = useState(event.meterHours !== null ? _fmtTenths(event.meterHours) : "");
	const [notes, setNotes] = useState(event.notes ?? "");
	const [cost, setCost] = useState(event.costCents !== null ? String(event.costCents / 100) : "");
	const [error, setError] = useState<string | null>(null);

	const parse = (v: string) => (v.trim() === "" ? null : parseTenths(v));
	const invalid =
		(miles.trim() !== "" && parse(miles) === null) ||
		(hours.trim() !== "" && parse(hours) === null);

	const save = useWrite(
		() =>
			api.patch(`/api/events/${event.id}`, {
				performedOn: date,
				...(equipment.hasMiles && { meterMiles: parse(miles) }),
				...(equipment.hasHours && { meterHours: parse(hours) }),
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
						<Field label="Cost (USD)">
							<Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
						</Field>
					</div>
					<div className="grid grid-cols-2 gap-3">
						{equipment.hasMiles && (
							<Field label="Miles at service">
								<Input
									inputMode="decimal"
									value={miles}
									onChange={(e) => setMiles(e.target.value)}
								/>
							</Field>
						)}
						{equipment.hasHours && (
							<Field label="Hours at service">
								<Input
									inputMode="decimal"
									value={hours}
									onChange={(e) => setHours(e.target.value)}
								/>
							</Field>
						)}
					</div>
					<Field label="Notes">
						<Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
					</Field>
					{error ? <Alert3>{error}</Alert3> : null}
					{save.error ? (
						<Alert3>
							{save.error instanceof ApiClientError ? save.error.message : "Save failed"}
						</Alert3>
					) : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending || invalid}>
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

// --- Fuel tab ---------------------------------------------------------------

function FuelTab({ equipment }: { equipment: EquipmentDto }) {
	const fuel = useFuel(equipment.id);
	const remove = useWrite((id: string) => api.delete(`/api/fuel/${id}`));
	const [dialog, setDialog] = useState<{ open: boolean; entry: FuelEntry | null }>({
		open: false,
		entry: null,
	});

	if (fuel.isPending) return <p className="text-muted-foreground">Loading fuel log…</p>;
	if (fuel.error)
		return (
			<p className="text-sm text-destructive">
				{fuel.error instanceof ApiClientError ? fuel.error.message : "Could not load fuel data."}
			</p>
		);

	const data = fuel.data;
	const summary = data.summary;
	// Entries arrive odometer-ascending; newest fill-up first for display.
	const entries = [...data.entries].reverse();

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm text-muted-foreground">
					Track mileage and fuel costs at every fill-up.
				</p>
				<Button size="sm" onClick={() => setDialog({ open: true, entry: null })}>
					<Plus /> Add fill-up
				</Button>
			</div>

			{entries.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-3 py-10 text-center">
						<Fuel className="size-8 text-muted-foreground" />
						<p className="text-muted-foreground">
							No fill-ups yet. Log your odometer and gallons at the pump to see MPG here.
						</p>
						<Button size="sm" onClick={() => setDialog({ open: true, entry: null })}>
							<Plus /> Log your first fill-up
						</Button>
					</CardContent>
				</Card>
			) : (
				<>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<SummaryCard
							label="Last MPG"
							value={
								summary.lastMpgTenths !== null ? `${(summary.lastMpgTenths / 10).toFixed(1)}` : "—"
							}
							hint="most recent interval"
						/>
						<SummaryCard
							label="Blended MPG"
							value={
								summary.blendedMpgTenths !== null
									? `${(summary.blendedMpgTenths / 10).toFixed(1)}`
									: "—"
							}
							hint="whole log"
						/>
						<SummaryCard
							label="Fuel cost"
							value={formatMoney(summary.totalCostCents)}
							hint={
								summary.avgPricePerGallonCents !== null
									? `${formatMoney(summary.avgPricePerGallonCents)}/gal avg`
									: "priced fill-ups only"
							}
						/>
						<SummaryCard
							label="Distance"
							value={formatMeterWithUnit(summary.distanceTenths, "miles")}
							hint={`${entries.length} fill-up${entries.length === 1 ? "" : "s"}`}
						/>
					</div>

					<TrendRow summary={summary} />

					<div className="grid gap-2">
						{entries.map((entry) => (
							<Card key={entry.id}>
								<CardContent className="flex flex-wrap items-center justify-between gap-3">
									<div className="min-w-0">
										<p className="flex flex-wrap items-center gap-2 text-sm font-medium">
											{formatDate(entry.loggedAt)}
											{entry.mpgTenths !== null ? (
												<Badge variant="neutral">{(entry.mpgTenths / 10).toFixed(1)} mpg</Badge>
											) : null}
										</p>
										<p className="text-xs text-muted-foreground">
											{formatMeterWithUnit(entry.odometer, "miles")}
											{" · "}
											{formatGallons(entry.gallonsHundredths)} gal
											{entry.pricePerGallonCents !== null
												? ` · ${formatMoney(entry.pricePerGallonCents)}/gal`
												: ""}
											{entry.totalCostCents !== null
												? ` · ${formatMoney(entry.totalCostCents)}`
												: ""}
										</p>
									</div>
									<div className="flex shrink-0 gap-1">
										<Button
											size="sm"
											variant="ghost"
											aria-label={`Edit fill-up from ${formatDate(entry.loggedAt)}`}
											onClick={() => setDialog({ open: true, entry })}
										>
											<Pencil />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											aria-label={`Delete fill-up from ${formatDate(entry.loggedAt)}`}
											onClick={() => remove.mutate(entry.id)}
										>
											Delete
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
					<p className="text-xs text-muted-foreground">
						MPG compares each fill-up's odometer to the previous one; price is optional and cost
						totals cover priced fill-ups only.
					</p>
				</>
			)}

			{dialog.open && (
				<FuelDialog
					open
					equipment={equipment}
					entry={dialog.entry}
					onClose={() => setDialog({ open: false, entry: null })}
				/>
			)}
		</div>
	);
}

/**
 * Compact trend strip: recent MPG direction vs the earlier average, plus the
 * best and worst single intervals. Engine decides when it's computable
 * (4+ intervals) so the baseline never overlaps the recent window.
 */
function TrendRow({ summary }: { summary: FuelSummary }) {
	const delta = summary.trendDeltaTenths;
	const oneDecimal = (tenths: number) => (tenths / 10).toFixed(1);

	let trend: React.ReactNode;
	if (!summary.trendComputable || delta === null) {
		trend = (
			<span className="text-muted-foreground">Log a few more fill-ups to see the MPG trend.</span>
		);
	} else if (delta > 0) {
		trend = (
			<span className="flex items-center gap-1 text-success">
				<TrendingUp className="size-4 shrink-0" aria-hidden="true" />
				{oneDecimal(delta)} vs earlier
			</span>
		);
	} else if (delta < 0) {
		trend = (
			<span className="flex items-center gap-1 text-destructive">
				<TrendingDown className="size-4 shrink-0" aria-hidden="true" />
				{oneDecimal(Math.abs(delta))} vs earlier
			</span>
		);
	} else {
		trend = (
			<span className="flex items-center gap-1 text-muted-foreground">
				<Minus className="size-4 shrink-0" aria-hidden="true" />
				Holding steady vs earlier
			</span>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
			{trend}
			{summary.bestMpg ? (
				<span className="text-muted-foreground">
					Best {oneDecimal(summary.bestMpg.mpgTenths)} mpg
					<span className="whitespace-nowrap"> ({formatDate(summary.bestMpg.loggedAt)})</span>
				</span>
			) : null}
			{summary.worstMpg ? (
				<span className="text-muted-foreground">
					Worst {oneDecimal(summary.worstMpg.mpgTenths)} mpg
					<span className="whitespace-nowrap"> ({formatDate(summary.worstMpg.loggedAt)})</span>
				</span>
			) : null}
		</div>
	);
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
	return (
		<Card>
			<CardContent className="py-3">
				<p className="text-xs text-muted-foreground">{label}</p>
				<p className="text-lg font-semibold">{value}</p>
				<p className="truncate text-xs text-muted-foreground">{hint}</p>
			</CardContent>
		</Card>
	);
}

// --- Info tab ---------------------------------------------------------------

function InfoTab({ equipment }: { equipment: EquipmentDto }) {
	const [readingUnit, setReadingUnit] = useState<"miles" | "hours" | null>(null);
	const [readingMode, setReadingMode] = useState<"increase" | "correction" | null>(null);
	const [readingValue, setReadingValue] = useState("");
	const remove = useWrite(() => api.delete(`/api/equipment/${equipment.id}`), {
		onDone: () => history.back(),
	});
	const archive = useWrite(() =>
		api.patch(`/api/equipment/${equipment.id}`, { archived: !equipment.archivedAt }),
	);

	const confirm = useWrite((unit: "miles" | "hours") =>
		api.post(`/api/equipment/${equipment.id}/reading`, { kind: unit, mode: "confirm" }),
	);
	const submitReading = useWrite(
		() =>
			api.post(`/api/equipment/${equipment.id}/reading`, {
				kind: readingUnit ?? "miles",
				mode: readingMode ?? "increase",
				value: parseTenths(readingValue),
			}),
		{
			onDone: () => {
				setReadingMode(null);
				setReadingUnit(null);
			},
		},
	);

	const invalid = readingValue.trim() === "" || parseTenths(readingValue) === null;

	const meterPanel = (unit: "miles" | "hours") => {
		const current = unit === "miles" ? equipment.currentMiles : equipment.currentHours;
		const verifiedAt = unit === "miles" ? equipment.milesVerifiedAt : equipment.hoursVerifiedAt;
		return (
			<Card>
				<CardContent className="grid gap-2">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="text-sm font-medium">{unit === "miles" ? "Mile meter" : "Hour meter"}</p>
						<p className="text-sm text-muted-foreground">
							{formatMeterWithUnit(current, unit)}
							{verifiedAt ? ` · verified ${formatDate(verifiedAt)}` : ""}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							onClick={() => {
								setReadingUnit(unit);
								setReadingMode("increase");
								setReadingValue("");
							}}
						>
							Update reading
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={current === null}
							onClick={() => confirm.mutate(unit)}
						>
							Confirm same reading
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setReadingUnit(unit);
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
		);
	};

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
					<InfoRow
						label="Meters"
						value={
							[equipment.hasMiles && "miles", equipment.hasHours && "hours"]
								.filter(Boolean)
								.join(" + ") || "none (calendar only)"
						}
					/>
					{equipment.hasMiles && (
						<InfoRow
							label="Current miles"
							value={`${formatMeterWithUnit(equipment.currentMiles, "miles")} · verified ${formatDate(equipment.milesVerifiedAt)}`}
						/>
					)}
					{equipment.hasHours && (
						<InfoRow
							label="Current hours"
							value={`${formatMeterWithUnit(equipment.currentHours, "hours")} · verified ${formatDate(equipment.hoursVerifiedAt)}`}
						/>
					)}
					{equipment.description ? <InfoRow label="Notes" value={equipment.description} /> : null}
				</CardContent>
			</Card>

			{equipment.hasMiles && meterPanel("miles")}
			{equipment.hasHours && meterPanel("hours")}

			<Dialog open={readingMode !== null} onOpenChange={(o) => !o && setReadingMode(null)}>
				<DialogContent
					title={
						readingMode === "correction"
							? `Correct current ${readingUnit ?? "meter"} reading`
							: `Update ${readingUnit ?? "meter"} reading`
					}
				>
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							submitReading.mutate();
						}}
					>
						<Field
							label={`Current ${readingUnit ?? ""}`}
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
					<Button
						variant="destructive"
						size="sm"
						disabled={pending}
						onClick={() => setConfirming(true)}
					>
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
	const [hasMiles, setHasMiles] = useState(equipment?.hasMiles ?? true);
	const [hasHours, setHasHours] = useState(equipment?.hasHours ?? false);
	// Edit mode starts blank: untouched fields are omitted from the PATCH so
	// saving an edit never writes a new reading or refreshes verification.
	const [currentMiles, setCurrentMiles] = useState("");
	const [currentHours, setCurrentHours] = useState("");
	const [error, setError] = useState<string | null>(null);

	const parse = (v: string) => (v.trim() === "" ? null : parseTenths(v));

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
				// A filled-in value may also set a newly added meter's first reading.
				return api.patch(`/api/equipment/${equipment.id}`, {
					...body,
					hasMiles,
					hasHours,
					...(currentMiles.trim() !== "" && { currentMiles: parse(currentMiles) }),
					...(currentHours.trim() !== "" && { currentHours: parse(currentHours) }),
				});
			}
			return api.post("/api/equipment", {
				...body,
				hasMiles,
				hasHours,
				currentMiles: parse(currentMiles),
				currentHours: parse(currentHours),
			});
		},
		{ onDone: onClose },
	);

	const meterInvalid =
		(currentMiles.trim() !== "" && parse(currentMiles) === null) ||
		(currentHours.trim() !== "" && parse(currentHours) === null);

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
					<div>
						<p className="mb-1.5 text-sm font-medium">Tracks</p>
						<div className="flex flex-wrap gap-x-6 gap-y-2">
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={hasMiles}
									onChange={(e) => setHasMiles(e.target.checked)}
									aria-label="Has a mile meter"
								/>
								Miles (vehicles)
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={hasHours}
									onChange={(e) => setHasHours(e.target.checked)}
									aria-label="Has an hour meter"
								/>
								Hours (machines)
							</label>
						</div>
						<p className="mt-1.5 text-xs text-muted-foreground">
							A diesel truck can carry both. With no meter checked the equipment is calendar-only.
							{equipment && " Removing a meter that already has readings or tasks is rejected."}
						</p>
					</div>
					{(hasMiles || hasHours) && (
						<div className="grid grid-cols-2 gap-3">
							{hasMiles && (
								<Field
									label={equipment ? "New miles reading" : "Current miles (optional)"}
									hint={
										equipment && equipment.currentMiles !== null
											? "Blank keeps the current reading."
											: undefined
									}
									error={
										currentMiles.trim() !== "" && parse(currentMiles) === null
											? "Number with at most one decimal."
											: undefined
									}
								>
									<Input
										inputMode="decimal"
										value={currentMiles}
										onChange={(e) => setCurrentMiles(e.target.value)}
										placeholder={
											equipment?.currentMiles != null
												? formatMeter(equipment.currentMiles)
												: "12,345"
										}
									/>
								</Field>
							)}
							{hasHours && (
								<Field
									label={equipment ? "New hours reading" : "Current hours (optional)"}
									hint={
										equipment && equipment.currentHours !== null
											? "Blank keeps the current reading."
											: undefined
									}
									error={
										currentHours.trim() !== "" && parse(currentHours) === null
											? "Number with at most one decimal."
											: undefined
									}
								>
									<Input
										inputMode="decimal"
										value={currentHours}
										onChange={(e) => setCurrentHours(e.target.value)}
										placeholder={
											equipment?.currentHours != null ? formatMeter(equipment.currentHours) : "145"
										}
									/>
								</Field>
							)}
						</div>
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

function dueParts(status: TaskStatusDto): string[] {
	const parts: string[] = [];
	if (status.miles.enabled && status.miles.nextDueMeter !== null)
		parts.push(`at ${formatMeterWithUnit(status.miles.nextDueMeter, "miles")}`);
	if (status.hours.enabled && status.hours.nextDueMeter !== null)
		parts.push(`at ${formatMeterWithUnit(status.hours.nextDueMeter, "hours")}`);
	if (status.calendar.enabled && status.calendar.nextDueDate !== null)
		parts.push(formatDate(status.calendar.nextDueDate));
	return parts;
}

function readingSummary(item: EquipmentDto): React.ReactNode {
	const parts = [
		item.hasMiles ? formatMeterWithUnit(item.currentMiles, "miles") : null,
		item.hasHours ? formatMeterWithUnit(item.currentHours, "hours") : null,
	].filter((s): s is string => s !== null && s !== "—");
	if (parts.length === 0) return null;
	return <>{` · ${parts.join(" · ")}`}</>;
}

function _fmtTenths(tenths: number): string {
	return formatMeter(tenths);
}
function parseTenths(value: string): number | null {
	return parseMeterToTenths(value);
}
