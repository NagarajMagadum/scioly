import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

export default async function Home() {
  const { supabase, user } = await getUser();

  if (!user) {
    return (
      <section className="panel">
        <h1>Practice that shows you the answer right away</h1>
        <p className="muted">
          Work through question banks by subject. Every answer is checked on the spot with an explanation, and coaches can
          follow their class&apos;s progress by topic.
        </p>
        <div className="row">
          <Link className="btn primary" href="/login">Sign in to start</Link>
        </div>
      </section>
    );
  }

  const { data: sets, error } = await supabase
    .from("question_sets")
    .select("id, title, description, subject:subjects(name), questions(count)")
    .order("title");

  return (
    <>
      <h1>Question sets</h1>
      {error && <p className="error">Couldn&apos;t load question sets: {error.message}</p>}
      {sets && sets.length === 0 && (
        <p className="notice">No question sets yet. Run the content import (see README) to load the first one.</p>
      )}
      <div className="cards">
        {(sets ?? []).map((s) => {
          const subject = Array.isArray(s.subject) ? s.subject[0] : s.subject;
          const count = Array.isArray(s.questions) ? (s.questions[0] as { count: number } | undefined)?.count ?? 0 : 0;
          return (
            <Link key={s.id} href={`/sets/${s.id}`} className="setcard">
              <span className="eyebrow">{subject?.name ?? "Subject"}</span>
              <h2>{s.title}</h2>
              <p className="muted">{s.description}</p>
              <span className="hint">{count} questions</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
