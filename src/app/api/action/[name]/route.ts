import { NextResponse } from "next/server";
import * as erp from "@/lib/erp";

export const dynamic = "force-dynamic";

type Handler = (body: Record<string, unknown>) => Promise<unknown>;

// Maps an action name to the corresponding ERP engine function. Each function
// runs its work inside a single DB transaction and enforces the accounting /
// inventory invariants.
const handlers: Record<string, Handler> = {
  "owner-investment": (b) => erp.recordOwnerInvestment(b as never),
  "grey-purchase": (b) => erp.recordGreyPurchase(b as never),
  "sale-order": (b) => erp.createSaleOrder(b as never),
  "production-order": (b) => erp.createProductionOrder(b as never),
  "allocate-grey": (b) => erp.allocateGrey(b as never),
  "issue-to-processor": (b) => erp.issueGreyToProcessor(b as never),
  "receive-processing": (b) => erp.receiveProcessing(b as never),
  "processing-bill": (b) => erp.createProcessingBill(b as never),
  "issue-to-stitcher": (b) => erp.issueToStitcher(b as never),
  "receive-stitching": (b) => erp.receiveStitching(b as never),
  "stitching-bill": (b) => erp.createStitchingBill(b as never),
  "dispatch-sale": (b) => erp.dispatchSale(b as never),
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const handler = handlers[name];
  if (!handler) {
    return NextResponse.json({ error: `Unknown action '${name}'.` }, { status: 404 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await handler(body);
    return NextResponse.json({ ok: true, ...(result as object) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
