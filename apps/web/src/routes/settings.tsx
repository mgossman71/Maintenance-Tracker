import type { PresetDto } from "@mt/shared";
import { formatMeter } from "@mt/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "../components/dialogs";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "../components/ui/dialog";
import { Field, Input } from "../components/ui/input";
import { ApiClientError, api } from "../lib/api";
import { usePresets, useSettings, useWrite } from "../lib/hooks";
import { useTheme } from "../lib/theme";

export function SettingsPage() {
	return (
		<div className="grid gap-5">
			<h1 className="text-xl font-semibold">Settings</h1>
			<AppearanceSection />
			<ThresholdsSection />
			<PresetsSection />
			<PasswordSection />
			<AboutSection />
		</div>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
			{children}
		</h2>
	);
}

function AppearanceSection() {
	const { mode, setMode } = useTheme();
	return (
		<section>
			<SectionTitle>Appearance</SectionTitle>
			<Card>
				<CardContent className="flex gap-2">
					{(["auto", "light", "dark"] as const).map((m) => (
						<Button
							key={m}
							size="sm"
							variant={mode === m ? "default" : "outline"}
							onClick={() => setMode(m)}
						>
							{m === "auto" ? "Auto" : m === "light" ? "Light" : "Dark"}
						</Button>
					))}
				</CardContent>
			</Card>
		</section>
	);
}

function ThresholdsSection() {
	const settings = useSettings();
	const [warnMiles, setWarnMiles] = useState<string | null>(null);
	const [warnHours, setWarnHours] = useState<string | null>(null);
	const [warnDays, setWarnDays] = useState<string | null>(null);
	const [staleDays, setStaleDays] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const save = useWrite(
		() =>
			api.patch("/api/settings", {
				warnMiles: Number.parseInt(warnMiles ?? String(settings.data?.warnMiles ?? 500), 10),
				warnHours: Number.parseInt(warnHours ?? String(settings.data?.warnHours ?? 10), 10),
				warnDays: Number.parseInt(warnDays ?? String(settings.data?.warnDays ?? 30), 10),
				staleReadingDays: Number.parseInt(
					staleDays ?? String(settings.data?.staleReadingDays ?? 30),
					10,
				),
			}),
		{ onDone: () => setSaved(true) },
	);

	if (settings.isPending) return null;
	const s = settings.data!;

	return (
		<section>
			<SectionTitle>Warning thresholds</SectionTitle>
			<Card>
				<CardContent className="grid gap-3 sm:grid-cols-4">
					<Field label="Warn within (miles)">
						<Input
							inputMode="numeric"
							value={warnMiles ?? String(s.warnMiles)}
							onChange={(e) => {
								setWarnMiles(e.target.value);
								setSaved(false);
							}}
						/>
					</Field>
					<Field label="Warn within (hours)">
						<Input
							inputMode="numeric"
							value={warnHours ?? String(s.warnHours)}
							onChange={(e) => {
								setWarnHours(e.target.value);
								setSaved(false);
							}}
						/>
					</Field>
					<Field label="Warn within (days)">
						<Input
							inputMode="numeric"
							value={warnDays ?? String(s.warnDays)}
							onChange={(e) => {
								setWarnDays(e.target.value);
								setSaved(false);
							}}
						/>
					</Field>
					<Field label="Stale reading (days)">
						<Input
							inputMode="numeric"
							value={staleDays ?? String(s.staleReadingDays)}
							onChange={(e) => {
								setStaleDays(e.target.value);
								setSaved(false);
							}}
						/>
					</Field>
					<div className="sm:col-span-4 flex items-center gap-3">
						<Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
							{save.isPending ? "Saving…" : "Save thresholds"}
						</Button>
						{saved ? <span className="text-sm text-success">Saved</span> : null}
						{save.error ? (
							<span className="text-sm text-destructive">{(save.error as Error).message}</span>
						) : null}
					</div>
				</CardContent>
			</Card>
		</section>
	);
}

function PresetsSection() {
	const presets = usePresets();
	const [editing, setEditing] = useState<PresetDto | null>(null);
	const [creating, setCreating] = useState(false);
	const [deleting, setDeleting] = useState<PresetDto | null>(null);

	const remove = useWrite(() => api.delete(`/api/presets/${deleting?.id}`));

	return (
		<section>
			<SectionTitle>Task preset library</SectionTitle>
			<p className="mb-2 text-sm text-muted-foreground">
				Suggestions only. Editing or hiding a preset never changes existing tasks, and presets are
				not manufacturer-approved schedules.
			</p>
			<Card>
				<CardContent className="divide-y divide-border">
					{(presets.data ?? []).map((preset) => (
						<div key={preset.id} className="flex items-center justify-between gap-2 py-2">
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{preset.name}</p>
								<p className="text-xs text-muted-foreground">
									{preset.suggestMeterInterval !== null &&
										`every ${formatMeter(preset.suggestMeterInterval)} mi/h · `}
									{preset.suggestCalendarValue !== null &&
										`every ${preset.suggestCalendarValue} ${preset.suggestCalendarUnit}`}
									{preset.suggestMeterInterval === null && preset.suggestCalendarValue === null
										? "no suggestion"
										: ""}
								</p>
							</div>
							<div className="flex shrink-0 gap-1">
								<Button size="sm" variant="ghost" onClick={() => setEditing(preset)}>
									Edit
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setDeleting(preset)}>
									{preset.isBuiltin ? "Hide" : "Delete"}
								</Button>
							</div>
						</div>
					))}
					<div className="flex gap-2 py-3">
						<Button size="sm" variant="outline" onClick={() => setCreating(true)}>
							New preset
						</Button>
					</div>
				</CardContent>
			</Card>
			{(editing || creating) && (
				<PresetDialog
					preset={editing}
					onClose={() => {
						setEditing(null);
						setCreating(false);
					}}
				/>
			)}
			<ConfirmDialog
				open={Boolean(deleting)}
				onClose={() => setDeleting(null)}
				title={deleting?.isBuiltin ? "Hide preset?" : "Delete preset?"}
				description={
					deleting?.isBuiltin
						? "Built-in presets are hidden, not deleted. Existing tasks are never modified."
						: "Existing tasks are never modified by preset changes."
				}
				confirmLabel={deleting?.isBuiltin ? "Hide" : "Delete"}
				destructive={!deleting?.isBuiltin}
				onConfirm={() => deleting && remove.mutate()}
			/>
		</section>
	);
}

function PresetDialog({ preset, onClose }: { preset: PresetDto | null; onClose: () => void }) {
	const [name, setName] = useState(preset?.name ?? "");
	const [meterInterval, setMeterInterval] = useState(
		preset?.suggestMeterInterval != null ? formatMeter(preset.suggestMeterInterval) : "",
	);
	const [calValue, setCalValue] = useState(preset?.suggestCalendarValue?.toString() ?? "");
	const save = useWrite(
		async () => {
			const body = {
				name: name.trim(),
				description: preset?.description ?? null,
				suggestMeterInterval:
					meterInterval.trim() === "" ? null : Math.round(Number.parseFloat(meterInterval) * 10),
				suggestCalendarValue: calValue.trim() === "" ? null : Number.parseInt(calValue, 10),
				suggestCalendarUnit: preset?.suggestCalendarUnit ?? (calValue.trim() ? "months" : null),
			};
			if (preset) return api.patch(`/api/presets/${preset.id}`, body);
			return api.post("/api/presets", body);
		},
		{ onDone: onClose },
	);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent title={preset ? "Edit preset" : "New preset"} className="max-w-sm">
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						save.mutate();
					}}
				>
					<Field label="Name">
						<Input value={name} onChange={(e) => setName(e.target.value)} />
					</Field>
					<Field label="Suggested meter interval (mi/h)" hint="Blank clears the suggestion.">
						<Input
							inputMode="decimal"
							value={meterInterval}
							onChange={(e) => setMeterInterval(e.target.value)}
						/>
					</Field>
					<Field label="Suggested time interval (months)" hint="Blank clears the suggestion.">
						<Input
							inputMode="numeric"
							value={calValue}
							onChange={(e) => setCalValue(e.target.value)}
						/>
					</Field>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending || !name.trim()}>
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function PasswordSection() {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const change = useWrite(
		() => api.post("/api/password/change", { currentPassword: current, newPassword: next }),
		{
			onDone: () => {
				setDone(true);
				queryClient.clear();
				setTimeout(() => navigate({ to: "/login" }), 1200);
			},
		},
	);

	const mismatch = next !== confirm;

	return (
		<section>
			<SectionTitle>Master password</SectionTitle>
			<Card>
				<CardContent>
					<form
						className="grid gap-3 sm:max-w-sm"
						onSubmit={(e) => {
							e.preventDefault();
							setError(null);
							change.mutate();
						}}
					>
						<Field label="Current password">
							<Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
						</Field>
						<Field label="New password" hint="At least 10 characters">
							<Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
						</Field>
						<Field
							label="Confirm new password"
							error={confirm && mismatch ? "Passwords do not match" : undefined}
						>
							<Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
						</Field>
						{change.error ? (
							<p className="text-sm text-destructive">
								{change.error instanceof ApiClientError ? change.error.message : "Change failed"}
							</p>
						) : null}
						{done ? (
							<p className="text-sm text-success">Password changed — all sessions revoked.</p>
						) : null}
						<div>
							<Button
								type="submit"
								size="sm"
								disabled={change.isPending || !current || !next || mismatch}
							>
								{change.isPending ? "Changing…" : "Change password"}
							</Button>
							{error ? null : null}
						</div>
					</form>
				</CardContent>
			</Card>
		</section>
	);
}

function AboutSection() {
	return (
		<section>
			<SectionTitle>About</SectionTitle>
			<Card>
				<CardContent className="text-sm text-muted-foreground">
					<p>Maintenance Tracker — self-hosted vehicle & equipment maintenance.</p>
					<p className="mt-1">
						Intervals are user-defined suggestions; always verify against your owner&apos;s manual.
					</p>
				</CardContent>
			</Card>
		</section>
	);
}
