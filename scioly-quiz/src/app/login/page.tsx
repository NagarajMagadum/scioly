import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <section className="panel" style={{ maxWidth: 460 }}>
      <h1>Sign in</h1>
      <p className="muted">Use Google, or get a sign-in link by email. No password needed.</p>
      {error && <p className="error">That sign-in link didn&apos;t work. It may have expired, so request a new one.</p>}
      <LoginForm next={next && next.startsWith("/") ? next : "/"} />
    </section>
  );
}
