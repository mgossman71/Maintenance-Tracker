import type { AppDatabase } from "@mt/db";
import type { Hono } from "hono";
import type { ServerConfig } from "../config";
import { isInlineSafeImage, readStoredFile, safeDisplayName } from "../http/uploads";
import {
	deleteAttachment,
	deleteDocument,
	getAttachmentRow,
	getDocumentRow,
	listDocuments,
	uploadAttachment,
	uploadDocument,
} from "../services/files";
import type { AppVariables } from "../types";
import { badRequest } from "../util";

async function fileFromRequest(
	c: { req: { formData: () => Promise<FormData> } & { header: (n: string) => string | undefined } },
	maxContentLength: number,
): Promise<File> {
	const length = Number.parseInt(c.req.header("content-length") ?? "0", 10);
	if (length > maxContentLength) throw badRequest("Upload too large for this server's limit.");
	const form = await c.req.formData();
	const file = form.get("file");
	if (!(file instanceof File)) throw badRequest("Multipart form with a `file` field is required.");
	return file;
}

export function registerFileRoutes(
	app: Hono<AppVariables>,
	db: AppDatabase,
	config: ServerConfig,
): void {
	const maxLen = config.maxUploadBytes + 1024 * 1024;

	const fileResponse = (storedName: string, mimeType: string, filename: string): Response => {
		const body = readStoredFile(config.dataDir, storedName);
		// Inline rendering is allowed only for sniffed safe image types; PDFs
		// and anything else always download as an attachment.
		const disposition = isInlineSafeImage(mimeType) ? "inline" : "attachment";
		return new Response(new Uint8Array(body) as unknown as BodyInit, {
			headers: {
				"Content-Type": mimeType,
				"Content-Disposition": `${disposition}; filename="${safeDisplayName(filename).replace(/"/g, "")}"`,
				"Cache-Control": "private, no-store",
			},
		});
	};

	// --- Equipment documents ---

	app.get("/api/equipment/:id/documents", (c) => c.json(listDocuments(db, c.req.param("id"))));

	app.post("/api/equipment/:id/documents", async (c) => {
		const file = await fileFromRequest(c, maxLen);
		const doc = await uploadDocument(db, config, c.req.param("id"), file);
		return c.json(doc, 201);
	});

	app.get("/api/documents/:id/download", (c) => {
		const row = getDocumentRow(db, c.req.param("id"));
		return fileResponse(row.storedName, row.mimeType, row.filename);
	});

	app.delete("/api/documents/:id", (c) => {
		deleteDocument(db, config, c.req.param("id"));
		return c.json({ ok: true });
	});

	// --- Event attachments ---

	app.post("/api/events/:id/attachments", async (c) => {
		const file = await fileFromRequest(c, maxLen);
		const att = await uploadAttachment(db, config, c.req.param("id"), file);
		return c.json(att, 201);
	});

	app.get("/api/attachments/:id/download", (c) => {
		const row = getAttachmentRow(db, c.req.param("id"));
		return fileResponse(row.storedName, row.mimeType, row.filename);
	});

	app.delete("/api/attachments/:id", (c) => {
		deleteAttachment(db, config, c.req.param("id"));
		return c.json({ ok: true });
	});
}
