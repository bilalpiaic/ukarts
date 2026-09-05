"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(endpoint: string, payload: unknown) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function VoucherActions({
  id,
  status,
  editable,
  isAdmin,
}: {
  id: string;
  status: string;
  editable: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print">
      <div className="doc-actions">
        {status === "DRAFT" && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await post("/api/action/journal-post", { id });
                router.refresh();
              })
            }
          >
            Post Voucher
          </button>
        )}
        {status === "DRAFT" && editable && (
          <Link className="btn-ghost" href={`/vouchers/${id}/edit`}>
            Edit
          </Link>
        )}
        {status === "POSTED" && isAdmin && (
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (!window.confirm("Unpost this voucher? It returns to DRAFT and can be edited.")) return;
                await post("/api/admin/journal-unpost", { id });
                router.refresh();
              })
            }
          >
            Unpost
          </button>
        )}
        {status === "DRAFT" && isAdmin && (
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (!window.confirm("Delete this unposted voucher permanently?")) return;
                await post("/api/admin/journal-delete", { id });
                router.push("/vouchers");
                router.refresh();
              })
            }
          >
            Delete
          </button>
        )}
      </div>
      {err && <div className="msg err no-print">{err}</div>}
    </div>
  );
}
