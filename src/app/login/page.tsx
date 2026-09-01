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
        <img src="/logo.svg" alt="U.K Arts" className="login-logo" width={56} height={56} />
        <div className="login-brand">U.K Arts ERP</div>
        <p className="subtitle">Sign in to continue</p>
        <LoginForm next={next ?? "/"} />
        <div className="login-hint">
          <div>Demo accounts</div>
          <div>
            <code>admin / admin123</code> · <code>user / user123</code>
          </div>
        </div>
      </div>
    </div>
  );
}
