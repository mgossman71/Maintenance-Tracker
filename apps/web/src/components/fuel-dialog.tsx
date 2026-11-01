import type { FuelLogDto } from "@mt/shared";
import { formatGallons, formatMeter, parseMeterToTenths, todayLocalDate } from "@mt/shared";
import { useState } from "react";
import { ApiClientError, api } from "../lib/api";
import { useWrite } from "../lib/hooks";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter } from "./ui/dialog";
import { Field, Input } from "./ui/input";

/** One fill-up with its computed interval figures (from FuelEconomyDto). */
export type FuelEntry = FuelLogDto & {
	distanceTenths: number | null;
	mpgTenths: number | null;
};

/** Dollars-per-gallon text -> integer cents (pump's 3rd decimal rounds). */
function parsePriceCents(input: string): number | null | undefined {
	const str = input.trim();
	if (str === "") return null;
	const dollars = Number.parseFloat(str);
	if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 1000) return undefined;
	return Math.round(dollars * 100);
}

/**
 * Add or edit a fill-up. Used from the equipment Fuel tab and the global
 * Fuel page; `entry` null means create (odometer prefilled from the
 * equipment's current reading).
 */
export function FuelDialog({
	open,
	onClose,
	equipment,
	entry,
}: {
	open: boolean;
	onClose: () => void;
	equipment: { id: string; currentMiles: number | null };
	entry: FuelEntry | null;
}) {
	const [loggedAt, setLoggedAt] = useState(entry?.loggedAt ?? todayLocalDate());
	const [odometer, setOdometer] = useState(() =>
		entry
			? formatMeter(entry.odometer)
			: equipment.currentMiles !== null
				? formatMeter(equipment.currentMiles)
				: "",
	);
	const [gallons, setGallons] = useState(entry ? formatGallons(entry.gallonsHundredths) : "");
	const [price, setPrice] = useState(
		entry?.pricePerGallonCents != null
			? (entry.pricePerGallonCents / 100).toFixed(2).replace(/\.00$/, "")
			: "",
	);

	const priceCents = parsePriceCents(price);
	const odometerTenths = odometer.trim() === "" ? null : parseMeterToTenths(odometer);
	const canSubmit = odometerTenths !== null && gallons.trim() !== "" && priceCents !== undefined;

	const save = useWrite(
		() =>
			entry
				? api.patch(`/api/fuel/${entry.id}`, {
						loggedAt,
						odometer: odometerTenths,
						gallons,
						pricePerGallonCents: priceCents,
					})
				: api.post(`/api/equipment/${equipment.id}/fuel`, {
						loggedAt,
						odometer: odometerTenths,
						gallons,
						pricePerGallonCents: priceCents,
					}),
		{ onDone: () => onClose() },
	);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent title={entry ? "Edit fill-up" : "Add fill-up"}>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (canSubmit) save.mutate();
					}}
				>
					<Field label="Date">
						<Input type="date" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
					</Field>
					<Field label="Odometer (miles)" hint="Reading on the pump when you finished.">
						<Input
							inputMode="decimal"
							autoFocus={!entry}
							value={odometer}
							onChange={(e) => setOdometer(e.target.value)}
						/>
					</Field>
					<Field label="Gallons">
						<Input
							inputMode="decimal"
							placeholder="12.75"
							value={gallons}
							onChange={(e) => setGallons(e.target.value)}
						/>
					</Field>
					<Field label="Price per gallon ($)" hint="Optional — needed for fuel cost totals.">
						<Input
							inputMode="decimal"
							placeholder="3.50"
							value={price}
							onChange={(e) => setPrice(e.target.value)}
						/>
					</Field>
					{save.error ? (
						<p className="text-sm text-destructive">
							{save.error instanceof ApiClientError ? save.error.message : "Could not save."}
						</p>
					) : null}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending || !canSubmit}>
							{save.isPending ? "Saving…" : entry ? "Save" : "Add fill-up"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
