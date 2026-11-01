import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Fuel, Gauge, LayoutDashboard, Settings, Wrench } from "lucide-react";
import { useEffect } from "react";
import { onUnauthorized } from "../lib/api";
import { useSession } from "../lib/hooks";
import { useTheme } from "../lib/theme";

/**
 * Auth gate: data routes render only once /api/session confirms the session;
 * anonymous visitors are redirected to the login screen.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
	const session = useSession();
	const navigate = useNavigate();
	const qc = useQueryClient();

	useEffect(() => {
		if (session.data && !session.data.authenticated) {
			navigate({ to: "/login", replace: true });
		}
	}, [session.data, navigate]);

	useEffect(() => {
		return onUnauthorized(() => {
			qc.clear();
			navigate({ to: "/login" });
		});
	}, [navigate, qc]);

	if (session.isPending || !session.data?.authenticated) {
		return (
			<div className="flex min-h-dvh items-center justify-center gap-2 text-muted-foreground">
				<Wrench className="size-5 animate-spin" />
				{session.isPending ? "Loading…" : "Redirecting to sign in…"}
			</div>
		);
	}
	return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
	const { mode, setMode } = useTheme();
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const cycleTheme = () => setMode(mode === "light" ? "dark" : mode === "dark" ? "auto" : "light");

	const logout = async () => {
		await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
		queryClient.clear();
		navigate({ to: "/login" });
	};

	return (
		<div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
			<header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
				<div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3">
					<Link to="/" className="flex min-w-0 items-center gap-2 font-semibold [&>span]:truncate">
						<Gauge className="size-5 shrink-0 text-primary" />
						<span>Maintenance Tracker</span>
					</Link>
					<div className="flex items-center gap-1 text-sm">
						<button
							type="button"
							onClick={cycleTheme}
							className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
							title={`Theme: ${mode} (click to change)`}
						>
							{mode === "auto" ? "Auto" : mode === "dark" ? "Dark" : "Light"}
						</button>
						<button
							type="button"
							onClick={logout}
							className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
						>
							Log out
						</button>
					</div>
				</div>
			</header>
			<main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
			<div className="mx-auto hidden max-w-4xl gap-4 px-4 pb-4 text-sm md:flex">
				<Link
					to="/"
					className="text-muted-foreground"
					activeProps={{ className: "font-semibold text-primary" }}
				>
					Dashboard
				</Link>
				<Link
					to="/equipment"
					className="text-muted-foreground"
					activeProps={{ className: "font-semibold text-primary" }}
				>
					Equipment
				</Link>
				<Link
					to="/fuel"
					className="text-muted-foreground"
					activeProps={{ className: "font-semibold text-primary" }}
				>
					Fuel
				</Link>
				<Link
					to="/settings"
					className="text-muted-foreground"
					activeProps={{ className: "font-semibold text-primary" }}
				>
					Settings
				</Link>
			</div>
			<nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
				<div className="grid grid-cols-4 text-xs">
					<NavLink to="/" label="Dashboard" icon={<LayoutDashboard className="size-5" />} />
					<NavLink to="/equipment" label="Equipment" icon={<Wrench className="size-5" />} />
					<NavLink to="/fuel" label="Fuel" icon={<Fuel className="size-5" />} />
					<NavLink to="/settings" label="Settings" icon={<Settings className="size-5" />} />
				</div>
			</nav>
		</div>
	);
}

function NavLink({
	to,
	label,
	icon,
}: {
	to: "/" | "/equipment" | "/fuel" | "/settings";
	label: string;
	icon: React.ReactNode;
}) {
	return (
		<Link
			to={to}
			className="flex flex-col items-center gap-0.5 py-2 text-muted-foreground"
			activeProps={{
				className: "flex flex-col items-center gap-0.5 py-2 font-semibold text-primary",
			}}
		>
			{icon}
			{label}
		</Link>
	);
}
