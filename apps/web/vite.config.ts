import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev-only proxy so the SPA is same-origin with the API, exactly like
// production (single Hono process serves both — build-plan.md §5).
export default defineConfig({
  plugins: [
    // Route-tree codegen: local, instant, compile-checked (build-plan §3).
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.MT_PORT ?? "8787"}`,
      },
    },
  },
});
