import { notFound } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { getManualInvoice, getOrganization } from "@/lib/erp";
import { ManualInvoiceSheet } from "../../../manual-invoice-sheet";

export const dynamic = "force-dynamic";

export default async function ManualSalesInvoicePrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [doc, org, session] = await Promise.all([getManualInvoice(id), getOrganization(), getSession()]);
  if (!doc) notFound();
  return <ManualInvoiceSheet org={org} doc={doc} admin={isAdmin(session)} />;
}
