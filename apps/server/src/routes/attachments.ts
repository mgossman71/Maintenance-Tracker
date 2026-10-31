import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  deleteAttachment,
  getAttachment,
  insertAttachment,
  listAttachmentsForEquipment,
} from "@maintenance-tracker/db";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { fail } from "../http/errors.ts";
import { isImage, type Sniffed, sanitizeFilename, sniffDocument } from "../http/uploads.ts";

/**
 * Files (§6.8): stored under DATA_DIR/files as `<id>.<sniffed-ext>`,
 * 0600; metadata in SQLite. Serving requires the session (auth gate) —
 * documents always arrive as attachments, inline only for real images.
 */
export async function readUploadFile(
  c: Context,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name };
}

function storeFile(
  deps: AppDeps,
  c: Context,
  target: { equipmentId: string; interventionId: string | null },
  upload: { bytes: Uint8Array; filename: string },
  opts: { requireImage: boolean },
) {
  if (upload.bytes.length > deps.maxUploadBytes) {
    return fail(c, "payload_too_large", 413, {
      message: `upload exceeds ${Math.floor(deps.maxUploadBytes / (1024 * 1024))} MB`,
    });
  }
  const sniffed: Sniffed = sniffDocument(upload.bytes);
  if (opts.requireImage && !isImage(sniffed)) {
    return fail(c, "unsupported_media", 415, {
      message: "photos must be png, jpeg, gif or webp",
    });
  }
  mkdirSync(deps.filesDir, { recursive: true, mode: 0o700 });
  const id = crypto.randomUUID();
  const storedName = `${id}.${sniffed.ext}`;
  writeFileSync(join(deps.filesDir, storedName), upload.bytes, { mode: 0o600 });
  const row = insertAttachment(deps.db, {
    equipmentId: target.equipmentId,
    interventionId: target.interventionId,
    filename: sanitizeFilename(upload.filename),
    storedName,
    mimeType: sniffed.mime,
    sizeBytes: upload.bytes.length,
  });
  return { row, id };
}

/** POST /api/equipment/:id/documents — any sniffable MIME (§6.8). */
export async function uploadDocument(deps: AppDeps, c: Context, equipmentId: string) {
  const upload = await readUploadFile(c);
  if (upload === null) {
    return fail(c, "validation_failed", 400, {
      details: [
        { path: "file", message: "multipart field 'file' with a non-empty file is required" },
      ],
    });
  }
  const stored = storeFile(deps, c, { equipmentId, interventionId: null }, upload, {
    requireImage: false,
  });
  if (stored instanceof Response) return stored;
  return c.json(stored.row, 201);
}

/** POST /api/interventions/:id/photos — images only, sniffed. */
export async function uploadPhoto(
  deps: AppDeps,
  c: Context,
  row: { equipmentId: string; id: string },
) {
  const upload = await readUploadFile(c);
  if (upload === null) {
    return fail(c, "validation_failed", 400, {
      details: [
        { path: "file", message: "multipart field 'file' with a non-empty file is required" },
      ],
    });
  }
  const stored = storeFile(
    deps,
    c,
    { equipmentId: row.equipmentId, interventionId: row.id },
    upload,
    { requireImage: true },
  );
  if (stored instanceof Response) return stored;
  return c.json(stored.row, 201);
}

/** /api/attachments/:id + equipment listing. */
export function attachmentsRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/equipment/:id", (c) => c.json(listAttachmentsForEquipment(deps.db, c.req.param("id"))));

  app.get("/:id", async (c) => {
    const row = getAttachment(deps.db, c.req.param("id"));
    if (row === null) return fail(c, "not_found", 404);
    const file = Bun.file(join(deps.filesDir, row.storedName));
    if (!(await file.exists())) return fail(c, "not_found", 404);
    const bytes = await file.arrayBuffer();
    c.header("content-type", row.mimeType);
    // documents ALWAYS download; only true images may render inline (§6.8).
    // RFC 6266 filename* keeps any language intact and the header ASCII-safe.
    const encoded = `filename*=UTF-8''${encodeURIComponent(sanitizeFilename(row.filename))}`;
    const disposition = isImage({ mime: row.mimeType, ext: "" })
      ? `inline; ${encoded}`
      : `attachment; ${encoded}`;
    c.header("content-disposition", disposition);
    return c.body(bytes);
  });

  app.delete("/:id", (c) => {
    const row = getAttachment(deps.db, c.req.param("id"));
    if (row === null) return fail(c, "not_found", 404);
    try {
      unlinkSync(join(deps.filesDir, row.storedName));
    } catch {
      // bytes already gone — the metadata deletion below is the point
    }
    deleteAttachment(deps.db, row.id);
    return c.body(null, 204);
  });

  return app;
}
