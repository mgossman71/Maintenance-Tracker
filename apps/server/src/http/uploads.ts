/**
 * Upload rules (build-plan §6.8), all in one honest place:
 * - every upload is MIME-SNIFFED from magic bytes — the client's declared
 *   type is decorative only;
 * - the stored extension is ALWAYS derived from the sniffed MIME;
 * - photos must sniff to an image, documents may be anything known, and
 *   unknown bytes stay honest as application/octet-stream.
 */

export interface Sniffed {
  mime: string;
  ext: string;
}

export const IMAGE_TYPES: Sniffed[] = [
  { mime: "image/png", ext: "png" },
  { mime: "image/jpeg", ext: "jpg" },
  { mime: "image/gif", ext: "gif" },
  { mime: "image/webp", ext: "webp" },
];

const KNOWN_TYPES: Sniffed[] = [
  ...IMAGE_TYPES,
  { mime: "application/pdf", ext: "pdf" },
  { mime: "application/zip", ext: "zip" }, // covers .docx/.xlsx containers
];

export function sniffType(bytes: Uint8Array): Sniffed | null {
  const b = bytes.subarray(0, 16);
  const ascii = (off: number, s: string) =>
    b.length >= off + s.length && [...s].every((c, i) => b[off + i] === c.charCodeAt(0));
  const hex = (offs: number[], hs: string[]) =>
    offs.every((v, i) => b.length > v && (b[v] ?? -1) === parseInt(hs[i] ?? "-1", 16));

  if (hex([0, 1, 2, 3], ["89", "50", "4e", "47"])) return IMAGE_TYPES[0] ?? null; // png
  if (hex([0, 1, 2], ["ff", "d8", "ff"])) return IMAGE_TYPES[1] ?? null; // jpeg
  if (ascii(0, "GIF8")) return IMAGE_TYPES[2] ?? null; // gif
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return IMAGE_TYPES[3] ?? null; // webp
  if (ascii(0, "%PDF-")) return { mime: "application/pdf", ext: "pdf" };
  if (ascii(0, "PK\u0003\u0004")) return { mime: "application/zip", ext: "zip" };
  return null;
}

export function sniffDocument(bytes: Uint8Array): Sniffed {
  return sniffType(bytes) ?? { mime: "application/octet-stream", ext: "bin" };
}

export function isImage(sniffed: Sniffed): boolean {
  return IMAGE_TYPES.some((t) => t.mime === sniffed.mime);
}

export function findKnown(sniffed: Sniffed): Sniffed | null {
  return KNOWN_TYPES.find((t) => t.mime === sniffed.mime) ?? null;
}

/**
 * Display filename: no path, no quotes (any script), no control chars.
 * Serving additionally uses RFC 6266 `filename*`, so unicode survives.
 */
export function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "file")
    .replace(/[""'“”‘’\\]/g, "")
    .replace(/\p{Cc}/gu, "")
    .trim();
  return base === "" ? "file" : base.slice(0, 200);
}
