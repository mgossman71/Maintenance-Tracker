import type { AppDatabase, EquipmentDocumentRow, EventAttachmentRow } from "@mt/db";
import { equipmentDocuments, eventAttachments, maintenanceEvents } from "@mt/db";
import type { AttachmentDto, DocumentDto } from "@mt/shared";
import { desc, eq, inArray } from "drizzle-orm";
import type { ServerConfig } from "../config";
import { deleteStoredFile, storeUpload } from "../http/uploads";
import { badRequest, notFound, nowIso, uuid } from "../util";
import { getEquipmentRow } from "./equipment";
import { getEventRow } from "./events";

export type { AttachmentDto, DocumentDto };

function toDocumentDto(row: EquipmentDocumentRow): DocumentDto {
	return {
		id: row.id,
		equipmentId: row.equipmentId,
		filename: row.filename,
		mimeType: row.mimeType,
		byteLength: row.byteLength,
		createdAt: row.createdAt,
	};
}

function toAttachmentDto(row: EventAttachmentRow): AttachmentDto {
	return {
		id: row.id,
		eventId: row.eventId,
		filename: row.filename,
		mimeType: row.mimeType,
		byteLength: row.byteLength,
		createdAt: row.createdAt,
	};
}

async function bytesFromFile(file: File, maxBytes: number): Promise<Uint8Array> {
	if (file.size > maxBytes) {
		throw badRequest(
			`File exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
		);
	}
	return new Uint8Array(await file.arrayBuffer());
}

// --- Equipment documents -----------------------------------------------------

export function listDocuments(db: AppDatabase, equipmentId: string): DocumentDto[] {
	return db
		.select()
		.from(equipmentDocuments)
		.where(eq(equipmentDocuments.equipmentId, equipmentId))
		.orderBy(desc(equipmentDocuments.createdAt))
		.all()
		.map(toDocumentDto);
}

export async function uploadDocument(
	db: AppDatabase,
	config: ServerConfig,
	equipmentId: string,
	file: File,
): Promise<DocumentDto> {
	getEquipmentRow(db, equipmentId); // 404 when missing
	const data = await bytesFromFile(file, config.maxUploadBytes);
	const stored = storeUpload(config.dataDir, data);
	const row: EquipmentDocumentRow = {
		id: uuid(),
		equipmentId,
		storedName: stored.storedName,
		filename: file.name.slice(0, 200) || stored.storedName,
		mimeType: stored.mimeType,
		byteLength: stored.byteLength,
		createdAt: nowIso(),
	};
	db.insert(equipmentDocuments).values(row).run();
	return toDocumentDto(row);
}

export function getDocumentRow(db: AppDatabase, id: string): EquipmentDocumentRow {
	const row = db.select().from(equipmentDocuments).where(eq(equipmentDocuments.id, id)).get();
	if (!row) throw notFound("Document");
	return row;
}

export function deleteDocument(db: AppDatabase, config: ServerConfig, id: string): void {
	const row = getDocumentRow(db, id);
	db.delete(equipmentDocuments).where(eq(equipmentDocuments.id, id)).run();
	deleteStoredFile(config.dataDir, row.storedName);
}

// --- Event attachments ---------------------------------------------------------

export function attachmentsForEvents(
	db: AppDatabase,
	eventIds: string[],
): Map<string, AttachmentDto[]> {
	const map = new Map<string, AttachmentDto[]>();
	if (eventIds.length === 0) return map;
	const rows = db
		.select()
		.from(eventAttachments)
		.where(inArray(eventAttachments.eventId, eventIds))
		.all();
	for (const row of rows) {
		const list = map.get(row.eventId);
		const dto = toAttachmentDto(row);
		if (list) list.push(dto);
		else map.set(row.eventId, [dto]);
	}
	return map;
}

export async function uploadAttachment(
	db: AppDatabase,
	config: ServerConfig,
	eventId: string,
	file: File,
): Promise<AttachmentDto> {
	getEventRow(db, eventId); // 404 when missing
	const data = await bytesFromFile(file, config.maxUploadBytes);
	const stored = storeUpload(config.dataDir, data);
	const row: EventAttachmentRow = {
		id: uuid(),
		eventId,
		storedName: stored.storedName,
		filename: file.name.slice(0, 200) || stored.storedName,
		mimeType: stored.mimeType,
		byteLength: stored.byteLength,
		createdAt: nowIso(),
	};
	db.insert(eventAttachments).values(row).run();
	return toAttachmentDto(row);
}

export function getAttachmentRow(db: AppDatabase, id: string): EventAttachmentRow {
	const row = db.select().from(eventAttachments).where(eq(eventAttachments.id, id)).get();
	if (!row) throw notFound("Attachment");
	return row;
}

export function deleteAttachment(db: AppDatabase, config: ServerConfig, id: string): void {
	const row = getAttachmentRow(db, id);
	db.delete(eventAttachments).where(eq(eventAttachments.id, id)).run();
	deleteStoredFile(config.dataDir, row.storedName);
}

/** Stored files owned by an event/equipment — for disk cleanup on cascade. */
export function storedFilesForEvent(db: AppDatabase, eventId: string): string[] {
	return db
		.select({ name: eventAttachments.storedName })
		.from(eventAttachments)
		.where(eq(eventAttachments.eventId, eventId))
		.all()
		.map((row) => row.name);
}

export function storedFilesForEquipment(db: AppDatabase, equipmentId: string): string[] {
	const docNames = db
		.select({ name: equipmentDocuments.storedName })
		.from(equipmentDocuments)
		.where(eq(equipmentDocuments.equipmentId, equipmentId))
		.all()
		.map((row) => row.name);
	const eventIds = db
		.select({ id: maintenanceEvents.id })
		.from(maintenanceEvents)
		.where(eq(maintenanceEvents.equipmentId, equipmentId))
		.all()
		.map((row) => row.id);
	const attachmentNames =
		eventIds.length === 0
			? []
			: db
					.select({ name: eventAttachments.storedName })
					.from(eventAttachments)
					.where(inArray(eventAttachments.eventId, eventIds))
					.all()
					.map((row) => row.name);
	return [...docNames, ...attachmentNames];
}
