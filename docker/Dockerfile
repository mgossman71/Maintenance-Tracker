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

# TODO(M9 hardening): prune dev deps from the runtime image copy
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages

# Non-root (uid 1000) per build-plan.md §6.8
RUN id bun >/dev/null 2>&1 || useradd -m -u 1000 bun \
  && mkdir -p /app/data \
  && chown -R bun:bun /app
USER bun

ENV MT_BIND=0.0.0.0 \
  MT_DATA_DIR=/app/data

EXPOSE 8787
CMD ["bun", "apps/server/src/index.ts"]
