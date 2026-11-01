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
import { type EquipmentLite, useDashboard, useEquipment } from "../lib/hooks";

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

interface VehicleCardData extends EquipmentLite {
	items: DashItem[];
	worst: number;
	hasOverdue: boolean;
	staleUnits: string[];
}

export function DashboardPage() {
	const dashboard = useDashboard();
	const equipment = useEquipment();
	const navigate = useNavigate();
	const [recordFor, setRecordFor] = useState<(EquipmentLite & { taskId: string }) | null>(null);
	const [readingFor, setReadingFor] = useState<EquipmentLite | null>(null);

	// One card per vehicle: dashboard tasks grouped by equipment, then every
	// unarchived item that has no (active) tasks joins with an empty list.
	const vehicles = useMemo<VehicleCardData[]>(() => {
		const items = (dashboard.data?.groups ?? []).flatMap((g) => g.items);
		const byId = new Map<string, VehicleCardData>();
		const ensure = (id: string, name: string) => {
			let v = byId.get(id);
			if (!v) {
				v = {
					id,
					name,
					hasMiles: false,
					hasHours: false,
					currentMiles: null,
					currentHours: null,
					items: [],
					worst: SEVERITY_NONE,
					hasOverdue: false,
					staleUnits: [],
				};
				byId.set(id, v);
			}
			return v;
		};
		for (const item of items) {
			const v = ensure(item.equipmentId, item.equipmentName);
			v.hasMiles ||= item.hasMiles;
			v.hasHours ||= item.hasHours;
			v.items.push(item);
		}
		for (const eq of equipment.data ?? []) {
			const v = ensure(eq.id, eq.name);
			// Prefer the equipment list's readings (authoritative, fresh writes).
			v.hasMiles = eq.hasMiles;
			v.hasHours = eq.hasHours;
			v.currentMiles = eq.currentMiles;
			v.currentHours = eq.currentHours;
		}
		for (const stale of dashboard.data?.staleReadingEquipment ?? []) {
			const v = byId.get(stale.id);
			if (v) v.staleUnits = stale.staleUnits;
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
					onRecord={(item) => setRecordFor({ ...lite(vehicle), taskId: item.taskId })}
					onUpdateReading={() => setReadingFor(lite(vehicle))}
				/>
			))}

			{recordFor && (
				<RecordServiceDialog
					open
					onClose={() => setRecordFor(null)}
					equipment={recordFor}
					defaultTaskId={recordFor.taskId}
				/>
			)}
			{readingFor && (
				<UpdateReadingDialog open onClose={() => setReadingFor(null)} equipment={readingFor} />
			)}
		</div>
	);
}

function lite(v: VehicleCardData): EquipmentLite {
	return {
		id: v.id,
		name: v.name,
		hasMiles: v.hasMiles,
		hasHours: v.hasHours,
		currentMiles: v.currentMiles,
		currentHours: v.currentHours,
	};
}

function VehicleCard({
	vehicle,
	onRecord,
	onUpdateReading,
}: {
	vehicle: VehicleCardData;
	onRecord: (item: DashItem) => void;
	onUpdateReading: () => void;
}) {
	const worstLabel =
		vehicle.worst === SEVERITY_NONE
			? null
			: (Object.keys(SEVERITY).find((k) => SEVERITY[k] === vehicle.worst) ?? null);
	const hasMeter = vehicle.hasMiles || vehicle.hasHours;
	const readings = [
		vehicle.hasMiles ? formatMeterWithUnit(vehicle.currentMiles, "miles") : null,
		vehicle.hasHours ? formatMeterWithUnit(vehicle.currentHours, "hours") : null,
	].filter((s): s is string => s !== null && s !== "—");

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
					{hasMeter && readings.length > 0 && (
						<span className="text-sm text-muted-foreground">{readings.join(" · ")}</span>
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
					{vehicle.staleUnits.length > 0 ? (
						<span className="flex items-center gap-1.5 text-xs text-warning">
							<AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
							{vehicle.staleUnits.map((u) => (u === "miles" ? "mile" : "hour")).join(" and ")}{" "}
							reading may be stale — confirm {vehicle.staleUnits.length > 1 ? "them" : "it"} for
							accurate due dates.
						</span>
					) : (
						<span />
					)}
					{hasMeter && (
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
	const dimParts: string[] = [];
	if (item.miles.enabled && item.miles.nextDueMeter !== null) {
		dimParts.push(
			`Due at ${formatMeterWithUnit(item.miles.nextDueMeter, "miles")}${
				item.miles.remainingMeter !== null
					? ` — ${formatRemaining(item.miles.remainingMeter, "miles")}`
					: ""
			}`,
		);
	}
	if (item.hours.enabled && item.hours.nextDueMeter !== null) {
		dimParts.push(
			`Due at ${formatMeterWithUnit(item.hours.nextDueMeter, "hours")}${
				item.hours.remainingMeter !== null
					? ` — ${formatRemaining(item.hours.remainingMeter, "hours")}`
					: ""
			}`,
		);
	}
	if (item.calendar.enabled && item.calendar.nextDueDate !== null) {
		dimParts.push(
			`Due ${formatDate(item.calendar.nextDueDate)}${
				item.calendar.remainingDays !== null ? ` — ${formatDays(item.calendar.remainingDays)}` : ""
			}`,
		);
	}

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
				{dimParts.length > 0 && (
					<p className="mt-0.5 text-xs text-muted-foreground">{dimParts.join(" · ")}</p>
				)}
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

function formatRemaining(tenths: number, unit: "miles" | "hours"): string {
	const text = formatSignedMeter(tenths, unit);
	return tenths < 0 ? text : `${text} left`;
}

function formatDays(days: number): string {
	return days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`;
}
