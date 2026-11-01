import type { DashboardGroup } from "@mt/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Gauge, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { RecordServiceDialog, UpdateReadingDialog } from "../components/dialogs";
import { Button } from "../components/ui/button";
import { Alert, Badge, Card, CardContent } from "../components/ui/card";
import {
	formatDate,
	formatMeterWithUnit,
	formatSignedMeter,
	STATUS_BADGE,
	STATUS_LABEL,
} from "../lib/format";
import { useDashboard, useEquipment } from "../lib/hooks";

type DashItem = DashboardGroup["items"][number];

/** Urgency ranking, mirroring the server's group order. */
const SEVERITY: Record<string, number> = {
	OVERDUE: 0,
	DUE: 1,
	DUE_SOON: 2,
	NEEDS_BASELINE: 3,
	OK: 4,
	DISABLED: 5,
};
const SEVERITY_NONE = 99; // no tracked tasks

function severity(status: string): number {
	return SEVERITY[status] ?? SEVERITY_NONE;
}

interface VehicleCardData {
	id: string;
	name: string;
	meterKind: string;
	currentMeter: number | null;
	items: DashItem[];
	worst: number;
	hasOverdue: boolean;
}

export function DashboardPage() {
	const dashboard = useDashboard();
	const equipment = useEquipment();
	const navigate = useNavigate();
	const [recordFor, setRecordFor] = useState<RecordTarget | null>(null);
	const [readingFor, setReadingFor] = useState<ReadingTarget | null>(null);

	// One card per vehicle: dashboard tasks grouped by equipment, then every
	// unarchived item that has no (active) tasks joins with an empty list.
	const vehicles = useMemo<VehicleCardData[]>(() => {
		const items = (dashboard.data?.groups ?? []).flatMap((g) => g.items);
		const byId = new Map<string, VehicleCardData>();
		const ensure = (id: string, name: string, meterKind: string, currentMeter: number | null) => {
			let v = byId.get(id);
			if (!v) {
				v = {
					id,
					name,
					meterKind,
					currentMeter,
					items: [],
					worst: SEVERITY_NONE,
					hasOverdue: false,
				};
				byId.set(id, v);
			}
			return v;
		};
		for (const item of items) {
			const v = ensure(item.equipmentId, item.equipmentName, item.meterKind, item.currentMeter);
			v.items.push(item);
		}
		for (const eq of equipment.data ?? []) {
			const v = ensure(eq.id, eq.name, eq.meterKind, eq.currentMeter);
			// Prefer the equipment list's reading (authoritative, fresh writes).
			v.currentMeter = eq.currentMeter;
		}
		for (const v of byId.values()) {
			v.items.sort((a, b) => severity(a.status) - severity(b.status));
			v.worst = v.items.reduce((min, i) => Math.min(min, severity(i.status)), SEVERITY_NONE);
			v.hasOverdue = v.items.some((i) => i.status === "OVERDUE");
		}
		return [...byId.values()].sort((a, b) => a.worst - b.worst || a.name.localeCompare(b.name));
	}, [dashboard.data, equipment.data]);

	if (dashboard.isPending || equipment.isPending)
		return <p className="text-muted-foreground">Loading dashboard…</p>;
	if (dashboard.error)
		return (
			<Alert variant="error">
				Could not load the dashboard: {(dashboard.error as Error).message}
			</Alert>
		);

	const hasAny = (equipment.data?.length ?? 0) > 0;
	if (!hasAny) {
		return (
			<div className="py-16 text-center">
				<h1 className="mb-2 text-xl font-semibold">Welcome to Maintenance Tracker</h1>
				<p className="mx-auto mb-6 max-w-md text-muted-foreground">
					Add your first vehicle or piece of equipment to start tracking service intervals by miles,
					hours, and calendar time.
				</p>
				<Button onClick={() => navigate({ to: "/equipment" })}>
					<Plus /> Add equipment
				</Button>
			</div>
		);
	}

	const staleIds = new Set((dashboard.data?.staleReadingEquipment ?? []).map((s) => s.id));
	const allClear = vehicles.every((v) => v.worst >= severity("OK"));

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Dashboard</h1>
				<Button size="sm" variant="outline" onClick={() => navigate({ to: "/equipment" })}>
					<Plus /> Equipment
				</Button>
			</div>

			{allClear && <p className="text-muted-foreground">Everything is up to date. Nice work.</p>}

			{vehicles.map((vehicle) => (
				<VehicleCard
					key={vehicle.id}
					vehicle={vehicle}
					stale={staleIds.has(vehicle.id)}
					onRecord={(item) =>
						setRecordFor({
							equipmentId: item.equipmentId,
							taskId: item.taskId,
							currentMeter: vehicle.currentMeter,
							meterKind: vehicle.meterKind,
						})
					}
					onUpdateReading={() =>
						setReadingFor({
							id: vehicle.id,
							name: vehicle.name,
							meterKind: vehicle.meterKind,
							currentMeter: vehicle.currentMeter,
						})
					}
				/>
			))}

			{recordFor && (
				<RecordServiceDialog
					open
					onClose={() => setRecordFor(null)}
					equipmentId={recordFor.equipmentId}
					defaultTaskId={recordFor.taskId}
					currentMeter={recordFor.currentMeter}
					meterKind={recordFor.meterKind}
				/>
			)}
			{readingFor && (
				<UpdateReadingDialog open onClose={() => setReadingFor(null)} equipment={readingFor} />
			)}
		</div>
	);
}

type RecordTarget = {
	equipmentId: string;
	taskId: string;
	currentMeter: number | null;
	meterKind: string;
};

type ReadingTarget = {
	id: string;
	name: string;
	meterKind: string;
	currentMeter: number | null;
};

function VehicleCard({
	vehicle,
	stale,
	onRecord,
	onUpdateReading,
}: {
	vehicle: VehicleCardData;
	stale: boolean;
	onRecord: (item: DashItem) => void;
	onUpdateReading: () => void;
}) {
	const worstLabel =
		vehicle.worst === SEVERITY_NONE
			? null
			: (Object.keys(SEVERITY).find((k) => SEVERITY[k] === vehicle.worst) ?? null);

	return (
		<Card data-vehicle={vehicle.id} className={vehicle.hasOverdue ? "border-destructive/60" : ""}>
			<CardContent className="grid gap-2">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<Link
						to="/equipment/$equipmentId"
						params={{ equipmentId: vehicle.id }}
						className="font-semibold hover:underline"
					>
						{vehicle.name}
					</Link>
					{worstLabel ? (
						<Badge variant={STATUS_BADGE[worstLabel] ?? "neutral"}>
							{STATUS_LABEL[worstLabel] ?? worstLabel}
						</Badge>
					) : (
						<Badge variant="neutral">Untracked</Badge>
					)}
					{vehicle.meterKind !== "none" && (
						<span className="text-sm text-muted-foreground">
							{formatMeterWithUnit(vehicle.currentMeter, vehicle.meterKind)}
						</span>
					)}
				</div>

				{vehicle.items.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No maintenance tasks yet —{" "}
						<Link
							to="/equipment/$equipmentId"
							params={{ equipmentId: vehicle.id }}
							className="text-primary hover:underline"
						>
							add one
						</Link>
						{" to track service here."}
					</p>
				) : (
					<div className="divide-y divide-border">
						{vehicle.items.map((item) => (
							<TaskRow key={item.taskId} item={item} onRecord={() => onRecord(item)} />
						))}
					</div>
				)}

				<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
					{stale ? (
						<span className="flex items-center gap-1.5 text-xs text-warning">
							<AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
							Reading may be stale — confirm it for accurate due dates.
						</span>
					) : (
						<span />
					)}
					{vehicle.meterKind !== "none" && (
						<Button
							size="sm"
							variant="outline"
							aria-label={`Update reading for ${vehicle.name}`}
							onClick={onUpdateReading}
						>
							<Gauge /> Update reading
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function TaskRow({ item, onRecord }: { item: DashItem; onRecord: () => void }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium">{item.taskName}</span>
					<Badge variant={STATUS_BADGE[item.status] ?? "neutral"}>
						{STATUS_LABEL[item.status] ?? item.status}
					</Badge>
				</div>
				<p className="mt-0.5 text-xs text-muted-foreground">{item.scheduleSummary}</p>
				<p className="mt-0.5 text-xs text-muted-foreground">
					{item.meter.nextDueMeter !== null && (
						<>
							Due at{" "}
							<span className="font-medium text-foreground">
								{formatMeterWithUnit(item.meter.nextDueMeter, item.meterKind)}
							</span>
							{item.meter.remainingMeter !== null && (
								<> — {formatSignedMeter(item.meter.remainingMeter, item.meterKind)} left</>
							)}
						</>
					)}
					{item.calendar.nextDueDate !== null && (
						<>
							{" · "}
							Due{" "}
							<span className="font-medium text-foreground">
								{formatDate(item.calendar.nextDueDate)}
							</span>
							{item.calendar.remainingDays !== null && (
								<> — {item.calendar.remainingDays} days left</>
							)}
						</>
					)}
				</p>
				{item.explanation ? (
					<p className="mt-0.5 text-xs text-warning">{item.explanation}</p>
				) : null}
			</div>
			<Button
				size="sm"
				variant="outline"
				aria-label={`Record service for ${item.taskName}`}
				onClick={onRecord}
			>
				Record service
			</Button>
		</div>
	);
}
