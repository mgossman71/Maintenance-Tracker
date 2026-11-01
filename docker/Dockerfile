# syntax=docker/dockerfile:1

# Build with the pinned toolchain (matches CI's engines.bun).
FROM oven/bun:1.4.4 AS build
WORKDIR /app

# Install from manifests first for layer caching.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build # compiles the web SPA into apps/web/dist

# Runtime: Bun executes the server from source; dev tooling never ships.
FROM oven/bun:1.4.4 AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    MT_BIND=0.0.0.0 \
    MT_PORT=3000 \
    MT_DATA_DIR=/data \
    MT_WEB_DIST=/app/apps/web/dist

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages

RUN useradd --system --uid 10001 mtuser \
    && mkdir -p /data \
    && chown -R mtuser:mtuser /data /app
USER mtuser

EXPOSE 3000
VOLUME ["/data"]

LABEL org.opencontainers.image.title="Maintenance Tracker" \
      org.opencontainers.image.description="Self-hosted vehicle & equipment maintenance tracker"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", "apps/server/src/index.ts"]
