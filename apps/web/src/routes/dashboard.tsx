import type { DashboardGroup } from "@mt/shared";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Gauge, Plus } from "lucide-react";
import { useState } from "react";
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

export function DashboardPage() {
	const dashboard = useDashboard();
	const equipment = useEquipment();
	const navigate = useNavigate();
	const [recordFor, setRecordFor] = useState<RecordTarget | null>(null);
	const [readingFor, setReadingFor] = useState<ReadingTarget | null>(null);

	if (dashboard.isPending) return <p className="text-muted-foreground">Loading dashboard…</p>;
	if (dashboard.error)
		return (
			<Alert variant="error">
				Could not load the dashboard: {(dashboard.error as Error).message}
			</Alert>
		);

	const groups = dashboard.data.groups;
	const stale = dashboard.data.staleReadingEquipment;
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

	const allClear = groups.every((g) => g.status === "OK");

	return (
		<div className="grid gap-5">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Dashboard</h1>
				<Button size="sm" variant="outline" onClick={() => navigate({ to: "/equipment" })}>
					<Plus /> Equipment
				</Button>
			</div>

			{stale.length > 0 && (
				<Alert variant="warning" className="flex items-start gap-2">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					<div>
						<p className="font-medium">
							{stale.length === 1
								? "One reading may be stale"
								: `${stale.length} readings may be stale`}
						</p>
						<p className="text-xs">
							{stale.map((s) => s.name).join(", ")} — open the item and update the current reading
							for accurate due dates.
						</p>
					</div>
				</Alert>
			)}

			{allClear && <p className="text-muted-foreground">Everything is up to date. Nice work.</p>}

			{groups.map((group) => (
				<GroupSection
					key={group.status}
					group={group}
					onRecord={(item) => setRecordFor(item)}
					onUpdateReading={(item) => setReadingFor(item)}
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

function GroupSection({
	group,
	onRecord,
	onUpdateReading,
}: {
	group: DashboardGroup;
	onRecord: (target: RecordTarget) => void;
	onUpdateReading: (target: ReadingTarget) => void;
}) {
	const items = group.items;
	if (items.length === 0) return null;
	return (
		<section>
			<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				{STATUS_LABEL[group.status] ?? group.status} ({items.length})
			</h2>
			<div className="grid gap-2">
				{items.map((item) => (
					<Card key={item.taskId}>
						<CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium">{item.equipmentName}</span>
									<span className="text-muted-foreground">·</span>
									<span>{item.taskName}</span>
									<Badge variant={STATUS_BADGE[item.status] ?? "neutral"}>
										{STATUS_LABEL[item.status] ?? item.status}
									</Badge>
								</div>
								<p className="mt-0.5 text-xs text-muted-foreground">{item.scheduleSummary}</p>
								<p className="mt-1 text-sm text-muted-foreground">
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
											{
												<span className="font-medium text-foreground">
													{formatDate(item.calendar.nextDueDate)}
												</span>
											}
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
							<div className="flex shrink-0 gap-2">
								{item.meterKind !== "none" && (
									<Button
										size="sm"
										variant="outline"
										aria-label={`Update reading for ${item.equipmentName}`}
										onClick={() =>
											onUpdateReading({
												id: item.equipmentId,
												name: item.equipmentName,
												meterKind: item.meterKind,
												currentMeter: item.currentMeter,
											})
										}
									>
										<Gauge /> Update reading
									</Button>
								)}
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										onRecord({
											equipmentId: item.equipmentId,
											taskId: item.taskId,
											currentMeter: item.currentMeter,
											meterKind: item.meterKind,
										})
									}
								>
									Record service
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}
