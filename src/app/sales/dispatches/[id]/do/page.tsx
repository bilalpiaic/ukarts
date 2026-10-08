import { notFound } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { getDispatch, getOrganization } from "@/lib/erp";
import { CommercialSheet } from "../../../commercial-sheet";

export const dynamic = "force-dynamic";

export default async function DeliveryOrderPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [doc, org, session] = await Promise.all([getDispatch(id), getOrganization(), getSession()]);
  if (!doc) notFound();
  return <CommercialSheet org={org} doc={doc} kind="do" admin={isAdmin(session)} />;
}
