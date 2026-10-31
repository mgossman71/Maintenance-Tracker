FROM oven/bun:1.4.4-slim AS build
WORKDIR /app

# Install deps from manifests first for layer caching
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.4.4-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production-only deps in the runtime image (M9): dev tooling — vite,
# drizzle-kit/esbuild, playwright — never ships. Workspace manifests are
# copied so the lockfile resolves; sources come from the build stage.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --production

COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages

# Non-root (uid 1000) per build-plan.md §6.8. NOTE: explicit if/ — with
# `id bun || useradd && chown` the && chain is skipped when `id` succeeds.
RUN if ! id bun >/dev/null 2>&1; then useradd -m -u 1000 bun; fi \
  && mkdir -p /app/data \
  && chown -R bun:bun /app
USER bun

ENV MT_BIND=0.0.0.0 \
  MT_DATA_DIR=/app/data

EXPOSE 8787
CMD ["bun", "apps/server/src/index.ts"]
