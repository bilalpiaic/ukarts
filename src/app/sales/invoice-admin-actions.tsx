"use client";

import Link from "next/link";
import { DeleteButton } from "../admin-controls";

/** Edit and delete for one sales invoice. Render this only for an admin session. */
export function InvoiceAdminActions({
  editHref,
  endpoint,
  invoiceId,
  confirmText,
  redirectTo,
}: {
  editHref: string;
  endpoint: string;
  invoiceId: string;
  confirmText: string;
  redirectTo?: string;
}) {
  return (
    <div className="row-actions no-print">
      <Link className="btn-ghost" href={editHref}>
        Edit
      </Link>
      <DeleteButton
        endpoint={endpoint}
        payload={{ id: invoiceId }}
        confirmText={confirmText}
        redirectTo={redirectTo}
      />
    </div>
  );
}
