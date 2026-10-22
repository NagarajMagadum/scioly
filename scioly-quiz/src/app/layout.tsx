import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Practice Lab", template: "%s · Practice Lab" },
  description: "Practice quizzes with instant feedback and class progress for coaches.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  try {
    const { user } = await getUser();
    signedIn = !!user;
  } catch {
    signedIn = false;
  }
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&family=Literata:opsz,wght@7..72,400;7..72,600&display=swap"
        />
      </head>
      <body>
        <header className="topbar">
          <div className="wrap">
            <Link href="/" className="brand">Practice Lab</Link>
            {signedIn && (
              <nav aria-label="Main">
                <Link href="/">Question sets</Link>
                <Link href="/classes">Classes</Link>
                <Link href="/account">Account</Link>
              </nav>
            )}
            <span className="spacer" />
            {signedIn ? (
              <form action="/auth/signout" method="post">
                <button className="linkbtn" type="submit">Sign out</button>
              </form>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
