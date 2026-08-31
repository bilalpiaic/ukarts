import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await healthCheck();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
