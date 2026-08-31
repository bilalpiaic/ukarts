import { NextResponse } from "next/server";
import { recordOwnerInvestment } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const amount = Number(body.amount);
    const date = String(body.date ?? new Date().toISOString().slice(0, 10));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "A positive amount is required." },
        { status: 400 },
      );
    }
    const result = await recordOwnerInvestment({ amount, date });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
