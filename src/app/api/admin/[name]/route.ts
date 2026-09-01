import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import * as admin from "@/lib/admin";

export const dynamic = "force-dynamic";

type Handler = (body: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  "org-update": (b) => admin.updateOrganization(b as never),
  "party-create": (b) => admin.createParty(b as never),
  "party-update": (b) => admin.updateParty(b as never),
  "party-delete": (b) => admin.deleteParty(b as never),
  "item-create": (b) => admin.createItem(b as never),
  "item-update": (b) => admin.updateItem(b as never),
  "item-delete": (b) => admin.deleteItem(b as never),
  "user-create": (b) => admin.createUser(b as never),
  "user-update": (b) => admin.updateUser(b as never),
  "user-delete": (b) => admin.deleteUser(b as never),
  "document-delete": (b) => admin.deleteDocument(b as never),
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  const { name } = await params;
  const handler = handlers[name];
  if (!handler) {
    return NextResponse.json({ error: `Unknown admin action '${name}'.` }, { status: 404 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await handler(body);
    return NextResponse.json({ ok: true, ...(result as object) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
