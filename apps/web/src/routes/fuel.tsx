import type { EquipmentDto } from "@mt/shared";
import { Link } from "@tanstack/react-router";
import { Fuel, Plus } from "lucide-react";
import { useState } from "react";
import { FuelDialog } from "../components/fuel-dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { formatMeterWithUnit, formatMoney } from "../lib/format";
import { useEquipment, useFuel } from "../lib/hooks";

/**
 * Global fuel page: every mile-based vehicle gets a card with a quick
 * "Add fill-up" button plus its current economy, no navigation needed.
 */
export function FuelPage() {
	const equipment = useEquipment();
	const mileBased = (equipment.data ?? []).filter((e) => e.meterKind === "miles");

	return (
		<div className="grid gap-4">
			<div>
				<h1 className="text-xl font-semibold">Fuel</h1>
				<p className="text-sm text-muted-foreground">
					Log a fill-up on the way out of the pump — MPG and cost totals update instantly.
				</p>
			</div>

			{equipment.isPending ? <p className="text-muted-foreground">Loading…</p> : null}
			{!equipment.isPending && mileBased.length === 0 && (
				<Card>
					<CardContent className="flex flex-col items-center gap-3 py-10 text-center">
						<Fuel className="size-8 text-muted-foreground" />
						<p className="text-muted-foreground">
							Fuel tracking covers equipment that measures miles. Add a truck, car, or boat with a
							mile meter to log fill-ups here.
						</p>
						<Button size="sm" variant="outline" asChild>
							<Link to="/equipment">Go to Equipment</Link>
						</Button>
					</CardContent>
				</Card>
			)}

			{mileBased.map((item) => (
				<VehicleFuelCard key={item.id} equipment={item} />
			))}
		</div>
	);
}

function VehicleFuelCard({ equipment }: { equipment: EquipmentDto }) {
	const fuel = useFuel(equipment.id);
	const [adding, setAdding] = useState(false);
	const summary = fuel.data?.summary;

	return (
		<Card>
			<CardContent className="grid gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="min-w-0">
						<Link
							to="/equipment/$equipmentId"
							params={{ equipmentId: equipment.id }}
							className="truncate font-medium hover:underline"
						>
							{equipment.name}
						</Link>
						<p className="text-xs text-muted-foreground">
							{equipment.currentMeter !== null
								? formatMeterWithUnit(equipment.currentMeter, equipment.meterKind)
								: "No reading yet"}
						</p>
					</div>
					<Button
						size="sm"
						aria-label={`Add fill-up for ${equipment.name}`}
						onClick={() => setAdding(true)}
					>
						<Plus /> Add fill-up
					</Button>
				</div>

				{fuel.isPending ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : fuel.error ? (
					<p className="text-sm text-destructive">Could not load fuel data.</p>
				) : (
					<div className="grid grid-cols-3 gap-2">
						<Stat
							label="Last MPG"
							value={summary?.lastMpgTenths != null ? (summary.lastMpgTenths / 10).toFixed(1) : "—"}
						/>
						<Stat
							label="Blended MPG"
							value={
								summary?.blendedMpgTenths != null ? (summary.blendedMpgTenths / 10).toFixed(1) : "—"
							}
						/>
						<Stat label="Fuel cost" value={formatMoney(summary?.totalCostCents ?? null)} />
					</div>
				)}

				{adding && (
					<FuelDialog open onClose={() => setAdding(false)} equipment={equipment} entry={null} />
				)}
			</CardContent>
		</Card>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<p className="truncate text-xs text-muted-foreground">{label}</p>
			<p className="truncate text-lg font-semibold">{value}</p>
		</div>
	);
}
