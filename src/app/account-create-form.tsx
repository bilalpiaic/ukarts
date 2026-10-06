"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACCOUNT_TYPES,
  type AccountType,
  defaultSerialBase,
  serialOptionsForType,
  type SerialAccount,
} from "@/lib/account-codes";
import { Combobox } from "./combobox";

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
};

type Msg = { kind: "ok" | "err"; text: string } | null;

export function AccountCreateForm({ accounts }: { accounts: SerialAccount[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("ASSET");
  const [serialBase, setSerialBase] = useState(() => defaultSerialBase(accounts, "ASSET"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const serialOptions = useMemo(() => serialOptionsForType(accounts, type), [accounts, type]);
  const selected = serialOptions.find((o) => o.value === serialBase) ?? serialOptions[0];
  const effectiveBase = selected?.value ?? serialBase;

  function onTypeChange(value: string) {
    const next = value as AccountType;
    setType(next);
    setSerialBase(defaultSerialBase(accounts, next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/account-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: name.trim(),
          account_type: type,
          serial_base: effectiveBase,
        }),
      });
      const data = (await res.json()) as { error?: string; account_code?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMsg({ kind: "ok", text: `Account created. Code ${data.account_code}.` });
      setName("");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !busy && name.trim().length > 0 && Boolean(selected?.nextCode);

  return (
    <form onSubmit={submit}>
      <h2>Add Account</h2>
      <p className="muted">
        Codes are assigned automatically from the designated serial point — Assets 1xxx,
        Liabilities 2xxx, Equity 3xxx, Income 4xxx, Expenses 5xxx.
      </p>
      <div className="form-row">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="form-row">
        <label>Type</label>
        <Combobox
          options={ACCOUNT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
          value={type}
          onChange={onTypeChange}
        />
      </div>
      <div className="form-row">
        <label>Serial from</label>
        <Combobox
          options={serialOptions.map((o) => ({ value: o.value, label: o.label }))}
          value={effectiveBase}
          onChange={setSerialBase}
        />
      </div>
      <div className="form-row">
        <label>Code</label>
        <input value={selected?.nextCode ?? "—"} readOnly aria-readonly="true" />
      </div>
      <button type="submit" disabled={!canSubmit}>
        {busy ? "Posting…" : "Create Account"}
      </button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
