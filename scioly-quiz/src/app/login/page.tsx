import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import TryQuestion from "./TryQuestion";

export const metadata: Metadata = { title: "Sign in" };

function Floaters() {
  // Decorative science doodles drifting behind the hero.
  return (
    <div className="floaters" aria-hidden="true">
      <svg className="f f1" viewBox="0 0 64 64"><circle cx="32" cy="32" r="5" fill="currentColor" /><ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="currentColor" strokeWidth="3" /><ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="currentColor" strokeWidth="3" transform="rotate(60 32 32)" /><ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="currentColor" strokeWidth="3" transform="rotate(120 32 32)" /></svg>
      <svg className="f f2" viewBox="0 0 64 64"><path d="M20 4c0 18 24 20 24 28S20 46 20 60M44 4c0 18-24 20-24 28s24 14 24 28" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /><path d="M24 14h16M22 24h20M22 40h20M24 50h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      <svg className="f f3" viewBox="0 0 64 64"><path d="M24 6h16M28 6v18L12 52a5 5 0 0 0 4 8h32a5 5 0 0 0 4-8L36 24V6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /><path d="M18 44h28" stroke="currentColor" strokeWidth="3" /><circle cx="28" cy="51" r="2.5" fill="currentColor" /><circle cx="37" cy="48" r="2" fill="currentColor" /></svg>
      <svg className="f f4" viewBox="0 0 64 64"><path d="M32 10v18M32 28c-4 6-12 4-14 12-2 9 2 16 8 16 5 0 6-6 6-12M32 28c4 6 12 4 14 12 2 9-2 16-8 16-5 0-6-6-6-12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
      <svg className="f f5" viewBox="0 0 64 64"><circle cx="32" cy="32" r="14" fill="none" stroke="currentColor" strokeWidth="3.5" /><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M13 51l6-6M45 19l6-6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
    </div>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="auth">
      <Floaters />
      <section className="auth-hero">
        <span className="eyebrow pill">Science Olympiad practice</span>
        <h1 className="hero-title">
          Train your brain like it&apos;s <span className="hl">game day.</span>
        </h1>
        <p className="hero-sub">
          Quick questions, instant answers, and a coach who can see you level up. Practice anytime, on any device.
        </p>
        <ul className="stats">
          <li><b>985</b><span>practice questions</span></li>
          <li><b>3</b><span>body systems</span></li>
          <li><b>1 tap</b><span>to see the answer</span></li>
        </ul>
        <TryQuestion />
      </section>

      <section className="auth-card" aria-labelledby="signin-title">
        <h2 id="signin-title">Jump in</h2>
        <p className="muted">Sign in to save your progress and join your team&apos;s class.</p>
        {error && <p className="error">That sign-in link didn&apos;t work. It may have expired, so request a new one.</p>}
        <LoginForm next={next && next.startsWith("/") ? next : "/"} />
        <ul className="perks">
          <li>Pick up where you left off on any device</li>
          <li>Redo the questions you missed</li>
          <li>Join your coach&apos;s class with a code</li>
        </ul>
      </section>
    </div>
  );
}
