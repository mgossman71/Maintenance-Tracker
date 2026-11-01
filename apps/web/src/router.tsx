import { QueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell, AuthGate } from "./components/shell";
import { DashboardPage } from "./routes/dashboard";
import { EquipmentDetailPage, EquipmentListPage } from "./routes/equipment";
import { LoginPage } from "./routes/login";
import { SettingsPage } from "./routes/settings";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: 1, refetchOnWindowFocus: false },
	},
});

const rootRoute = createRootRoute();

function guarded(Cmp: React.ComponentType) {
	return function GuardedPage() {
		return (
			<AuthGate>
				<AppShell>
					<Cmp />
				</AppShell>
			</AuthGate>
		);
	};
}

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/login",
	component: LoginPage,
});

const dashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: guarded(DashboardPage),
});

const equipmentRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/equipment",
	component: guarded(EquipmentListPage),
});

const equipmentDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/equipment/$equipmentId",
	component: guarded(EquipmentDetailPage),
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: guarded(SettingsPage),
});

export const router = createRouter({
	routeTree: rootRoute.addChildren([
		loginRoute,
		dashboardRoute,
		equipmentRoute,
		equipmentDetailRoute,
		settingsRoute,
	]),
	defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
