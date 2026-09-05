import { query, withTransaction } from "./db";
import {
  ACTION_ATTACH,
  ALLOWED_EXT,
  MAX_FILE_BYTES,
  MAX_FILES,
  type AllowedExt,
} from "./attachment-types";

export {
  ACTION_ATTACH,
  ALLOWED_EXT,
  MAX_FILE_BYTES,
  MAX_FILES,
};
export type { AllowedExt };

export const ENTITY_TABLE: Record<string, string> = {
  GREY_PURCHASE: "inventory.grey_purchases",
  SALE_ORDER: "sales.sale_orders",
  PRODUCTION_ORDER: "production.production_orders",
  PROCESSING_BILL: "production.processing_bills",
  STITCHING_BILL: "production.stitching_bills",
  JOURNAL: "accounting.journal_entries",
};

export const MIME_BY_EXT: Record<AllowedExt, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  mp3: "audio/mpeg",
};

export interface FileMeta {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  mime_type: string;
  file_ext: string;
  byte_size: number;
  created_at: string;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function validateUpload(fileName: string, byteSize: number, mimeType: string) {
  const ext = extOf(fileName);
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    throw new Error(
      `Unsupported file type '.${ext || "unknown"}'. Allowed: ${ALLOWED_EXT.join(", ")}.`,
    );
  }
  if (byteSize <= 0 || byteSize > MAX_FILE_BYTES) {
    throw new Error(`Each file must be between 1 byte and ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  const expected = MIME_BY_EXT[ext as AllowedExt];
  const mime = (mimeType || expected).toLowerCase();
  return {
    ext: ext as AllowedExt,
    mime: !mime || mime === "application/octet-stream" ? expected : mime,
  };
}

export async function assertEntity(entityType: string, entityId: string) {
  const table = ENTITY_TABLE[entityType];
  if (!table) throw new Error(`Attachments are not enabled for '${entityType}'.`);
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) throw new Error("Invalid document id.");
  const rows = await query(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [entityId]);
  if (rows.length === 0) throw new Error("Document not found.");
}

export async function listAttachments(entityType: string, entityId: string): Promise<FileMeta[]> {
  return query<FileMeta>(
    `SELECT id, entity_type, entity_id, file_name, mime_type, file_ext, byte_size,
            created_at::text
     FROM master.document_files
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at`,
    [entityType, entityId],
  );
}

export async function getAttachment(id: string): Promise<
  | (FileMeta & { content: Buffer })
  | null
> {
  const rows = await query<FileMeta & { content: Buffer }>(
    `SELECT id, entity_type, entity_id, file_name, mime_type, file_ext, byte_size,
            created_at::text, content
     FROM master.document_files WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function saveAttachments(input: {
  entityType: string;
  entityId: string;
  uploadedBy: string;
  files: { fileName: string; mimeType: string; bytes: Buffer }[];
}): Promise<FileMeta[]> {
  if (input.files.length === 0) return [];
  if (input.files.length > MAX_FILES) {
    throw new Error(`At most ${MAX_FILES} files can be attached.`);
  }
  await assertEntity(input.entityType, input.entityId);
  const existing = await query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM master.document_files WHERE entity_type=$1 AND entity_id=$2",
    [input.entityType, input.entityId],
  );
  if (Number(existing[0]?.n ?? 0) + input.files.length > MAX_FILES) {
    throw new Error(`At most ${MAX_FILES} files per document.`);
  }

  return withTransaction(async (client) => {
    const saved: FileMeta[] = [];
    for (const f of input.files) {
      const { ext, mime } = validateUpload(f.fileName, f.bytes.length, f.mimeType);
      const res = await client.query<FileMeta>(
        `INSERT INTO master.document_files
           (entity_type, entity_id, file_name, mime_type, file_ext, byte_size, content, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, entity_type, entity_id, file_name, mime_type, file_ext, byte_size, created_at::text`,
        [
          input.entityType,
          input.entityId,
          f.fileName.slice(0, 255),
          mime,
          ext,
          f.bytes.length,
          f.bytes,
          input.uploadedBy,
        ],
      );
      saved.push(res.rows[0]);
    }
    return saved;
  });
}

export async function deleteAttachment(id: string) {
  const res = await query<{ id: string }>(
    "DELETE FROM master.document_files WHERE id = $1 RETURNING id",
    [id],
  );
  if (res.length === 0) throw new Error("Attachment not found.");
}

export async function deleteEntityAttachments(entityType: string, entityId: string) {
  await query("DELETE FROM master.document_files WHERE entity_type = $1 AND entity_id = $2", [
    entityType,
    entityId,
  ]);
}
