"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Combobox, type Option } from "../combobox";

export function LoginForm({ next, users }: { next: string; users: Option[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username) {
      setError("Choose your username from the list.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      router.push(next || "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <label>Username</label>
        <Combobox
          options={users}
          value={username}
          onChange={setUsername}
          placeholder="Choose your username"
          autoFocus
        />
      </div>
      <div className="form-row">
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <button type="submit" disabled={busy || !username} style={{ width: "100%" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && <div className="msg err">{error}</div>}
    </form>
  );
}
