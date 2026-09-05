"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(endpoint: string, payload: unknown): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
}

export function DeleteButton({
  endpoint,
  payload,
  label = "Delete",
  confirmText = "Delete this record? This cannot be undone.",
}: {
  endpoint: string;
  payload: Record<string, unknown>;
  label?: string;
  confirmText?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await post(endpoint, payload);
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-danger" disabled={busy} onClick={onClick}>
      {busy ? "…" : label}
    </button>
  );
}

/** Generic admin action button (e.g. unpost) with confirmation. */
export function ActionButton({
  endpoint,
  payload,
  label,
  confirmText,
  ghost = true,
}: {
  endpoint: string;
  payload: Record<string, unknown>;
  label: string;
  confirmText?: string;
  ghost?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onClick() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await post(endpoint, payload);
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={ghost ? "btn-ghost" : ""} disabled={busy} onClick={onClick}>
      {busy ? "…" : label}
    </button>
  );
}

type Kind = "party" | "item" | "user" | "account" | "design";

interface Row {
  id: string;
  [k: string]: string | null | undefined;
}

const STATUS_OPTS = ["ACTIVE", "INACTIVE"];
const ITEM_TYPES = ["GREY_CLOTH", "PROCESSED_CLOTH", "FINISHED_GOOD", "OTHER"];
const ROLES = ["ADMIN", "USER", "ACCOUNTANT", "INVENTORY_MANAGER", "PRODUCTION_MANAGER", "SALES_USER", "VIEWER"];
const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export function AdminEntityTable({ kind, rows }: { kind: Kind; rows: Row[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [passwordOnly, setPasswordOnly] = useState(false);
  const [draft, setDraft] = useState<Row>({} as Row);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancelEdit() {
    setEditing(null);
    setPasswordOnly(false);
    setError(null);
  }

  function startEdit(row: Row) {
    setEditing(row.id);
    setPasswordOnly(false);
    setDraft({ ...row, password: "" });
    setError(null);
  }

  function startPassword(row: Row) {
    setEditing(row.id);
    setPasswordOnly(true);
    setDraft({ ...row, password: "" });
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { id: draft.id };
      if (kind === "party") {
        payload.party_name = draft.party_name;
        payload.phone = draft.phone;
        payload.email = draft.email;
        payload.address = draft.address;
        payload.status = draft.status;
      } else if (kind === "item") {
        payload.item_name = draft.item_name;
        payload.item_type = draft.item_type;
        payload.status = draft.status;
      } else if (kind === "account") {
        payload.account_name = draft.account_name;
        payload.account_type = draft.account_type;
        payload.status = draft.status;
      } else if (kind === "design") {
        payload.design_name = draft.design_name;
        payload.standard_consumption = draft.standard_consumption;
        payload.status = draft.status;
      } else {
        payload.full_name = draft.full_name;
        payload.role = draft.role;
        payload.status = draft.status;
        if (passwordOnly && !draft.password) {
          throw new Error("Enter a new password.");
        }
        if (draft.password) payload.password = draft.password;
      }
      await post(`/api/admin/${kind}-update`, payload);
      cancelEdit();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const headers =
    kind === "party"
      ? ["Code", "Name", "Roles", "Status", ""]
      : kind === "item"
        ? ["Code", "Name", "Type", "Status", ""]
        : kind === "account"
          ? ["Code", "Name", "Type", "Status", ""]
          : kind === "design"
            ? ["Code", "Name", "Consumption", "Status", ""]
            : ["Username", "Name", "Role", "Status", "Password", ""];

  return (
    <>
      {error && <div className="msg err">{error}</div>}
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEdit = editing === row.id;
            return (
              <tr key={row.id}>
                {kind === "party" && (
                  <>
                    <td>{row.party_code}</td>
                    <td>
                      {isEdit ? (
                        <input value={draft.party_name ?? ""} onChange={(e) => setDraft({ ...draft, party_name: e.target.value })} />
                      ) : (
                        row.party_name
                      )}
                    </td>
                    <td>{row.roles}</td>
                    <td>
                      {isEdit ? (
                        <select value={draft.status ?? ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {STATUS_OPTS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.status
                      )}
                    </td>
                  </>
                )}
                {kind === "item" && (
                  <>
                    <td>{row.item_code}</td>
                    <td>
                      {isEdit ? (
                        <input value={draft.item_name ?? ""} onChange={(e) => setDraft({ ...draft, item_name: e.target.value })} />
                      ) : (
                        row.item_name
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <select value={draft.item_type ?? ""} onChange={(e) => setDraft({ ...draft, item_type: e.target.value })}>
                          {ITEM_TYPES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.item_type
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <select value={draft.status ?? ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {STATUS_OPTS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.status
                      )}
                    </td>
                  </>
                )}
                {kind === "account" && (
                  <>
                    <td>{row.account_code}</td>
                    <td>
                      {isEdit ? (
                        <input value={draft.account_name ?? ""} onChange={(e) => setDraft({ ...draft, account_name: e.target.value })} />
                      ) : (
                        <>
                          {row.account_name}
                          {row.control_caption ? (
                            <span className="pill" style={{ marginLeft: 8 }}>
                              Control · {row.control_caption}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <select value={draft.account_type ?? ""} onChange={(e) => setDraft({ ...draft, account_type: e.target.value })}>
                          {ACCOUNT_TYPES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.account_type
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <select value={draft.status ?? ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {STATUS_OPTS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.status
                      )}
                    </td>
                  </>
                )}
                {kind === "design" && (
                  <>
                    <td>{row.design_code}</td>
                    <td>
                      {isEdit ? (
                        <input value={draft.design_name ?? ""} onChange={(e) => setDraft({ ...draft, design_name: e.target.value })} />
                      ) : (
                        row.design_name
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <input
                          type="number"
                          step="0.0001"
                          value={draft.standard_consumption ?? ""}
                          onChange={(e) => setDraft({ ...draft, standard_consumption: e.target.value })}
                        />
                      ) : (
                        row.standard_consumption
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <select value={draft.status ?? ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {STATUS_OPTS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.status
                      )}
                    </td>
                  </>
                )}
                {kind === "user" && (
                  <>
                    <td><code>{row.username}</code></td>
                    <td>
                      {isEdit && !passwordOnly ? (
                        <input value={draft.full_name ?? ""} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
                      ) : (
                        row.full_name
                      )}
                    </td>
                    <td>
                      {isEdit && !passwordOnly ? (
                        <select value={draft.role ?? ""} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                          {ROLES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.role
                      )}
                    </td>
                    <td>
                      {isEdit && !passwordOnly ? (
                        <select value={draft.status ?? ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {STATUS_OPTS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        row.status
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <input
                          type="password"
                          autoComplete="new-password"
                          placeholder={passwordOnly ? "New password" : "New password (optional)"}
                          value={draft.password ?? ""}
                          onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                        />
                      ) : (
                        <span className="password-mask">••••••••</span>
                      )}
                    </td>
                  </>
                )}
                <td>
                  <div className="row-actions">
                    {isEdit ? (
                      <>
                        <button disabled={busy} onClick={save}>
                          {busy ? "…" : passwordOnly ? "Save password" : "Save"}
                        </button>
                        <button className="btn-ghost" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost" onClick={() => startEdit(row)}>
                          Edit
                        </button>
                        {kind === "user" && (
                          <button className="btn-ghost" onClick={() => startPassword(row)}>
                            Change password
                          </button>
                        )}
                        <DeleteButton endpoint={`/api/admin/${kind}-delete`} payload={{ id: row.id }} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
