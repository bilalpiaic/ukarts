import { notFound } from "next/navigation";
import { getDispatch, getOrganization } from "@/lib/erp";
import { CommercialSheet } from "../../../commercial-sheet";

export const dynamic = "force-dynamic";

export default async function SalesInvoicePrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [doc, org] = await Promise.all([getDispatch(id), getOrganization()]);
  if (!doc) notFound();
  return <CommercialSheet org={org} doc={doc} kind="invoice" />;
}
