import { listSignInUsers } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const people = await listSignInUsers();
  const users = people.map((u) => ({
    value: u.username,
    label:
      u.full_name && u.full_name.trim().toLowerCase() !== u.username.trim().toLowerCase()
        ? `${u.username} — ${u.full_name}`
        : u.username,
  }));
  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="U.K Arts" className="login-logo" width={128} height={128} />
        <div className="login-brand">U.K Arts</div>
        <p className="subtitle">Sign in to the accounting workspace</p>
        <LoginForm next={next ?? "/"} users={users} />
      </div>
    </div>
  );
}
