import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="U.K Arts" className="login-logo" width={128} height={128} />
        <div className="login-brand">U.K Arts ERP</div>
        <p className="subtitle">Cloth · Craft · Passion</p>
        <LoginForm next={next ?? "/"} />
      </div>
    </div>
  );
}
