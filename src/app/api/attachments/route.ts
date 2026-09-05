import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  ACTION_ATTACH,
  listAttachments,
  saveAttachments,
} from "@/lib/attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") ?? "";
  const entityId = url.searchParams.get("entityId") ?? "";
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }
  try {
    const files = await listAttachments(entityType, entityId);
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireUser();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const entityType = String(form.get("entityType") ?? "");
    const entityId = String(form.get("entityId") ?? "");
    const blobs = form.getAll("files").filter((v): v is File => v instanceof File);
    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
    }
    const allowedTypes = new Set(Object.values(ACTION_ATTACH).map((a) => a.entityType));
    allowedTypes.add("JOURNAL");
    if (!allowedTypes.has(entityType)) {
      return NextResponse.json({ error: `Unknown entity type '${entityType}'.` }, { status: 400 });
    }
    const files = [];
    for (const blob of blobs) {
      const bytes = Buffer.from(await blob.arrayBuffer());
      files.push({ fileName: blob.name || "upload", mimeType: blob.type, bytes });
    }
    const saved = await saveAttachments({
      entityType,
      entityId,
      uploadedBy: session.uid,
      files,
    });
    return NextResponse.json({ ok: true, files: saved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
