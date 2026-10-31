import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev-only proxy so the SPA is same-origin with the API, exactly like
// production (single Hono process serves both — build-plan.md §5).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.MT_PORT ?? "8787"}`,
      },
    },
  },
});
