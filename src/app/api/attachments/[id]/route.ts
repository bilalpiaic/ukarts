import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteAttachment, getAttachment } from "@/lib/attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeName(name: string): string {
  return name.replace(/[\r\n"]/g, "_");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
  const { id } = await params;
  const row = await getAttachment(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const body = new Uint8Array(row.content);
  return new NextResponse(body, {
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Content-Length": String(row.byte_size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName(row.file_name)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deleteAttachment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
