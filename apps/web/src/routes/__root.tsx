import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: DefaultNotFound,
});

function RootLayout() {
  return (
    <div className="min-h-dvh">
      <Outlet />
    </div>
  );
}

function DefaultNotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="text-muted-foreground">That page doesn't exist.</p>
        <Link
          to="/"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
