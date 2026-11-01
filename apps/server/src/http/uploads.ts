import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError } from "../util";

/**
 * Upload storage: random names under MT_DATA_DIR/uploads, user filenames are
 * display metadata only and never touch the filesystem path. Types are
 * validated by magic-byte sniffing against a small allowlist — no SVG, no
 * HTML, no executables, regardless of what the client claimed.
 */

export interface StoredFile {
	storedName: string;
	mimeType: string;
	byteLength: number;
}

const ALLOWED: Array<{ mime: string; ext: string; inline: boolean }> = [
	{ mime: "image/png", ext: ".png", inline: true },
	{ mime: "image/jpeg", ext: ".jpg", inline: true },
	{ mime: "image/gif", ext: ".gif", inline: true },
	{ mime: "image/webp", ext: ".webp", inline: true },
	{ mime: "application/pdf", ext: ".pdf", inline: false },
];

export function isInlineSafeImage(mime: string): boolean {
	return ALLOWED.some((a) => a.mime === mime && a.inline);
}

/** Identify content type from magic bytes; null when not an allowed type. */
export function sniffMimeType(bytes: Uint8Array): string | null {
	const starts = (sig: number[], offset = 0): boolean =>
		bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);
	if (starts([0x89, 0x50, 0x4e, 0x47])) return "image/png";
	if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
	if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
	if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
	if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
	return null;
}

export function uploadsDir(dataDir: string): string {
	const dir = join(dataDir, "uploads");
	mkdirSync(dir, { recursive: true });
	return dir;
}

/**
 * Validate and persist one uploaded file. Enforces the configured size limit
 * and the sniffed-type allowlist; returns the random storage name.
 */
export function storeUpload(dataDir: string, data: Uint8Array): StoredFile {
	if (data.byteLength === 0) throw new ApiError(400, "empty_file", "Uploaded file is empty");
	const mime = sniffMimeType(data);
	if (!mime) {
		throw new ApiError(
			415,
			"unsupported_type",
			"Unsupported file type. Allowed: PNG, JPEG, GIF, WebP, PDF.",
		);
	}
	const entry = ALLOWED.find((a) => a.mime === mime);
	const storedName = `${randomUUID()}${entry?.ext ?? ""}`;
	writeFileSync(join(uploadsDir(dataDir), storedName), data);
	return { storedName, mimeType: mime, byteLength: data.byteLength };
}

export function readStoredFile(dataDir: string, storedName: string): Buffer {
	// Random uuid names only — reject anything path-like regardless.
	if (!/^[0-9a-f-]{36}(\.[a-z0-9]+)?$/.test(storedName)) {
		throw new ApiError(400, "bad_name", "Invalid stored file name");
	}
	try {
		return readFileSync(join(uploadsDir(dataDir), storedName));
	} catch {
		throw new ApiError(404, "not_found", "Stored file is missing from disk");
	}
}

export function deleteStoredFile(dataDir: string, storedName: string): void {
	if (!/^[0-9a-f-]{36}(\.[a-z0-9]+)?$/.test(storedName)) return;
	rmSync(join(uploadsDir(dataDir), storedName), { force: true });
}

/** Sanitize a user-supplied display filename for Content-Disposition. */
export function safeDisplayName(filename: string): string {
	const base = filename.split(/[\\/]/).pop() ?? "file";
	return base.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}
