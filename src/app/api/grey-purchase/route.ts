import { NextResponse } from "next/server";
import { recordGreyPurchase } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supplierId = String(body.supplierId ?? "");
    const itemId = String(body.itemId ?? "");
    const quantity = Number(body.quantity);
    const rate = Number(body.rate);
    const date = String(body.date ?? new Date().toISOString().slice(0, 10));

    if (!supplierId || !itemId) {
      return NextResponse.json(
        { error: "Supplier and item are required." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "A positive quantity is required." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json(
        { error: "A positive rate is required." },
        { status: 400 },
      );
    }

    const result = await recordGreyPurchase({
      supplierId,
      itemId,
      quantity,
      rate,
      date,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
