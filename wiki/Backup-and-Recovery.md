# Backup & Recovery

Everything you own lives in `MT_DATA_DIR`: the SQLite database
(`maintenance.db`, WAL mode) and uploaded files (`uploads/`). Copy those and
you have a complete backup — the app has zero external dependencies.

> **Never copy the live `maintenance.db*` files** while the app runs — WAL
> mode means the newest writes sit in `maintenance.db-wal`. Use the snapshot
> method below (or stop the app).

## Back up (hot snapshot, safe while running)

`VACUUM INTO` writes a consistent copy of the database even while the app
serves requests:

```bash
# 1. Snapshot the database inside the running container
docker compose exec app bun -e '
const { Database } = require("bun:sqlite");
const db = new Database("/data/maintenance.db", { readonly: true });
db.exec(`VACUUM INTO "/data/backup-${new Date().toISOString().slice(0, 10)}.db"`);
'

# 2. Copy the snapshot and uploads off the volume
docker compose cp app:/data/backup-2026-11-01.db ./backup-2026-11-01.db
docker run --rm -v maintenance-tracker_mt_v1_data:/data -v "$PWD:/backup" alpine \
  cp -r /data/uploads /backup/uploads-backup
```

Bare metal: run the same `VACUUM INTO` with any SQLite client against
`$MT_DATA_DIR/maintenance.db`, then copy the snapshot + `uploads/`.

Back up **after** big data-entry sessions; a snapshot is only as fresh as
the moment you took it. Store backups wherever you keep other important
personal data — they contain no secrets beyond password _hashes_ (Argon2id).

## Restore

1. Stop the app: `docker compose stop`.
2. Into the volume, place:
   - your snapshot renamed to `maintenance.db`,
   - the `uploads/` directory,
   - and **delete** any leftover `maintenance.db-wal` / `maintenance.db-shm`
     files from the old database.
3. Start: `docker compose up -d`. Migrations run against the restored schema;
   restoring a snapshot from an older app version is fine (append-only
   migrations), restoring to an _older binary_ is not.

Quick smoke after restore: `/health` responds, login works, equipment and
history look right, and a document downloads.

## Lost password

The reset CLI talks directly to the database — it needs shell access to the
data directory, which is exactly why it's safe. **It revokes all sessions**
(everyone logs out) and works without email.

```bash
# Docker (interactive prompt, no echo):
docker compose exec app bun apps/server/src/cli/reset-password.ts

# Bare metal:
MT_DATA_DIR=./data bun apps/server/src/cli/reset-password.ts --password "new-password"
```

The new password must be at least 10 characters. If the app wasn't set up
yet, this also completes setup.

## Moving servers

1. Take a hot snapshot + copy `uploads/` (above).
2. On the new host, `cp .env.example .env` (keep the same `TZ`), start the
   container, stop it, restore the files into the new volume, start again.
3. Point the DNS/proxy at the new host. Same HTTPS origin keeps existing
   sessions working; otherwise everyone logs in once.

## What about automatic backups?

Deliberately out of v1 scope — the manual snapshot is consistent and
one-command. If you want automation, a host cron that runs the
`VACUUM INTO` + `docker compose cp` + `rsync` is sufficient; the app never
needs outbound network access for it.

Next: [Security](Security) — what the protections are and why.
