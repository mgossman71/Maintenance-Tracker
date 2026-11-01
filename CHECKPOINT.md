# Checkpoint

## Last verified milestone

M6 (documents/attachments, Docker, README, reset CLI) implemented and verified;
final commit pending. All prior milestones (M0–M4 + UI + e2e) committed.

## Verification commands (all green as of this checkpoint)

```bash
bun install
bunx biome ci .                 # 0 errors (apps/web/src/styles.css excluded: Tailwind v4 at-rules)
bun run typecheck               # 4 packages + tests/e2e tsconfig
bun test                        # 69 pass, 0 fail
bun run build                   # web bundle
rm -rf /tmp/mt-e2e-playwright && bun run e2e   # 3 pass (§12 scenario, ATV, dashboard)
docker build -f docker/Dockerfile -t maintenance-tracker:ci .   # builds; smoke: health/index/401/non-root all verified
```

## Decisions made this session

- e2e specs renamed `*.e2e.ts` + Playwright `testMatch` — root `bun test` never collects them (CI contract).
- Upload storage: magic-byte MIME allowlist (png/jpeg/gif/webp/pdf), uuid storage names under `MT_DATA_DIR/uploads`, inline rendering only for sniffed images, PDFs always `Content-Disposition: attachment`; cascade deletes remove files from disk; `Field` forwards label → `aria-label` (fixes a11y + Playwright `getByLabel`).
- `docker/Dockerfile` multi-stage (oven/bun:1.4.4, non-root uid 10001, VOLUME /data, bun -e healthcheck). `compose.yaml` with loopback port + `npm_proxy` network commented for NPM.
- Password-reset CLI at `apps/server/src/cli/reset-password.ts` — verified against a real DB (new password works, old dead, sessions revoked).

## Known problems

- None blocking. Upload test config pins MT_MAX_UPLOAD_MB=1 for speed.

## Single exact next action

Run the final gate sequence above and `git commit` the M6 batch (uploads, Docker, compose, .env.example, README, reset CLI, e2e rename, status docs).
