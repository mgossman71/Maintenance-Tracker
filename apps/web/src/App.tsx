import { healthResponseSchema } from "@maintenance-tracker/shared";
import { useEffect, useState } from "react";

type Health = "checking" | "ok" | "down";

/**
 * M0 hello-world. The point isn't the pixels — it's that SPA ↔ shared
 * types ↔ Hono API are wired end-to-end and the health pill proves it.
 */
export function App() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: unknown) => {
        if (!cancelled) setHealth(healthResponseSchema.safeParse(body).success ? "ok" : "down");
      })
      .catch(() => {
        if (!cancelled) setHealth("down");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Maintenance-Tracker</h1>
      <p>Your garage, logged. Everything else in this app is still a plan.</p>
      <p data-testid="api-health">
        API: <strong>{health === "ok" ? "ok" : health}</strong>
      </p>
    </main>
  );
}
