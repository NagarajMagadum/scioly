import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";
import { Sci } from "@/components/Sci";
import { Pct } from "@/components/Pct";
import { ago, pct } from "@/lib/format";
import type { Labelled, Topic } from "@/lib/types";

export const metadata: Metadata = { title: "Class" };

type Agg = { n?: number; g: number; c: number };
type ProgressRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  answered: number;
  graded: number;
  correct: number;
  waiting: number;
  by_part: Record<string, Agg>;
  by_section: Record<string, Agg>;
  by_topic: Record<string, Agg>;
  last_active: string | null;
};
type SetInfo = { id: string; title: string; parts: Labelled[]; sections: Labelled[]; topics: Topic[] };

async function assignSet(formData: FormData) {
  "use server";
  const { supabase } = await getUser();
  const classId = String(formData.get("class_id"));
  const setId = String(formData.get("set_id"));
  await supabase.from("class_sets").insert({ class_id: classId, set_id: setId });
  revalidatePath(`/classes/${classId}`);
}

async function unassignSet(formData: FormData) {
  "use server";
  const { supabase } = await getUser();
  const classId = String(formData.get("class_id"));
  await supabase.from("class_sets").delete().eq("class_id", classId).eq("set_id", String(formData.get("set_id")));
  revalidatePath(`/classes/${classId}`);
}

async function removeStudent(formData: FormData) {
  "use server";
  const { supabase } = await getUser();
  const classId = String(formData.get("class_id"));
  await supabase.from("class_members").delete().eq("class_id", classId).eq("user_id", String(formData.get("user_id"))).eq("role", "student");
  redirect(`/classes/${classId}`);
}

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ set?: string; student?: string }>;
}) {
  const { classId } = await params;
  const sp = await searchParams;
  const { supabase, user } = await getUser();

  const { data: cls } = await supabase.from("classes").select("id, name, join_code, owner_id").eq("id", classId).maybeSingle();
  if (!cls) notFound();
  const { data: me } = await supabase.from("class_members").select("role").eq("class_id", classId).eq("user_id", user!.id).maybeSingle();
  const isTeacher = me?.role === "teacher";

  const { data: assignedRows } = await supabase
    .from("class_sets")
    .select("set:question_sets(id, title, parts, sections, topics)")
    .eq("class_id", classId);
  const assigned = (assignedRows ?? [])
    .map((r) => (Array.isArray(r.set) ? r.set[0] : r.set))
    .filter(Boolean) as SetInfo[];

  if (!isTeacher) {
    return (
      <>
        <h1>{cls.name}</h1>
        <section className="panel">
          <h2>Assigned practice</h2>
          {assigned.length === 0 ? (
            <p className="muted">Your coach hasn&apos;t assigned a question set yet. You can still practice any set from the Question sets page.</p>
          ) : (
            <ul>{assigned.map((s) => <li key={s.id}><Link href={`/sets/${s.id}`}>{s.title}</Link></li>)}</ul>
          )}
          <p className="hint">Your coach sees your answers to these questions, by topic. Update the name they see on the Account page.</p>
        </section>
      </>
    );
  }

  // ---------------- teacher view ----------------
  const { data: allSets } = await supabase.from("question_sets").select("id, title").order("title");
  const unassigned = (allSets ?? []).filter((s) => !assigned.some((a) => a.id === s.id));
  const current = assigned.find((s) => s.id === sp.set) ?? assigned[0];

  let rows: ProgressRow[] = [];
  let hardest: { question_id: string; code: string; stem: string; graded: number; missed: number }[] = [];
  let loadError: string | null = null;
  if (current) {
    const [p, h] = await Promise.all([
      supabase.rpc("class_progress", { p_class: classId, p_set: current.id }),
      supabase.rpc("class_hardest", { p_class: classId, p_set: current.id, p_limit: 15 }),
    ]);
    if (p.error) loadError = p.error.message;
    rows = (p.data ?? []) as ProgressRow[];
    hardest = h.data ?? [];
  }

  const started = rows.filter((r) => r.answered > 0);
  const week = rows.filter((r) => r.last_active && Date.now() - new Date(r.last_active).getTime() < 7 * 864e5).length;
  const tot = rows.reduce((s, r) => ({ g: s.g + r.graded, c: s.c + r.correct, n: s.n + r.answered }), { g: 0, c: 0, n: 0 });

  // class accuracy by topic
  const topicAgg: Record<string, { g: number; c: number; students: number }> = {};
  for (const r of rows) for (const [t, a] of Object.entries(r.by_topic ?? {})) {
    const x = (topicAgg[t] ??= { g: 0, c: 0, students: 0 });
    x.g += a.g; x.c += a.c; x.students += 1;
  }

  const selected = rows.find((r) => r.user_id === sp.student);
  let missed: { code: string; stem: string }[] = [];
  if (selected && current) {
    const { data: la } = await supabase
      .from("latest_attempts")
      .select("question_id")
      .eq("user_id", selected.user_id)
      .eq("set_id", current.id)
      .eq("correct", false)
      .limit(500);
    const ids = (la ?? []).map((x) => x.question_id);
    if (ids.length) {
      const { data: qs } = await supabase.from("questions").select("code, stem, position").in("id", ids.slice(0, 200)).order("position");
      missed = (qs ?? []) as { code: string; stem: string }[];
    }
  }
  const base = `/classes/${classId}?set=${current?.id ?? ""}`;

  return (
    <>
      <div className="row">
        <h1>{cls.name}</h1>
        <span className="spacer" />
        <span className="hint">Students join with code</span>
        <span className="code">{cls.join_code}</span>
      </div>

      <section className="panel">
        <h2>Assigned question sets</h2>
        {assigned.length === 0 && <p className="muted">Assign a question set to start tracking progress.</p>}
        <div className="row">
          {assigned.map((s) => (
            <form key={s.id} action={unassignSet} className="row">
              <input type="hidden" name="class_id" value={classId} />
              <input type="hidden" name="set_id" value={s.id} />
              <Link className="btn" href={`/classes/${classId}?set=${s.id}`} aria-current={current?.id === s.id}>
                {current?.id === s.id ? "● " : ""}{s.title}
              </Link>
              <button className="linkbtn" type="submit" aria-label={`Unassign ${s.title}`}>Unassign</button>
            </form>
          ))}
        </div>
        {unassigned.length > 0 && (
          <form action={assignSet} className="row">
            <input type="hidden" name="class_id" value={classId} />
            <label htmlFor="set_id">Assign</label>
            <select id="set_id" name="set_id">{unassigned.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
            <button className="btn" type="submit">Assign set</button>
          </form>
        )}
      </section>

      {current && (
        <>
          {loadError && <p className="error">Couldn&apos;t load progress: {loadError}</p>}
          <section className="panel">
            <h2>Progress · {current.title}</h2>
            <div className="kpis">
              <div className="kpi"><b>{rows.length}</b><span>students in class</span></div>
              <div className="kpi"><b>{started.length}</b><span>have started</span></div>
              <div className="kpi"><b>{week}</b><span>active this week</span></div>
              <div className="kpi"><b>{tot.n}</b><span>questions answered</span></div>
              <div className="kpi"><b>{pct(tot.c, tot.g) ?? "—"}{tot.g ? "%" : ""}</b><span>class accuracy</span></div>
            </div>
          </section>

          <section className="panel">
            <h2>Students</h2>
            <p className="hint">Percent correct of graded answers (latest try per question). Numbers in brackets are questions answered. Select a name for details.</p>
            <div className="tablebox">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="num">Answered</th>
                    <th className="num">Accuracy</th>
                    {current.parts.map((p) => <th key={p.code} className="num">{p.title.replace(/^Part \d+ – /, "").replace(/ System$/, "")}</th>)}
                    <th>Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={4 + current.parts.length} className="muted">No students yet. Share the join code above.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td>
                        <Link href={`${base}&student=${r.user_id}`}>{r.display_name || r.email || "Student"}</Link>
                        {r.email && <div className="hint">{r.email}</div>}
                      </td>
                      <td className="num">{r.answered}</td>
                      <td className="num"><Pct c={r.correct} g={r.graded} /></td>
                      {current.parts.map((p) => {
                        const a = r.by_part?.[p.code];
                        return <td key={p.code} className="num">{a ? <><Pct c={a.c} g={a.g} /> <span className="muted">({a.n})</span></> : <span className="muted">—</span>}</td>;
                      })}
                      <td>{ago(r.last_active)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selected && (
            <section className="panel" id="student">
              <div className="row">
                <h2>{selected.display_name || selected.email || "Student"}</h2>
                <span className="hint">{selected.answered} answered · {selected.waiting} waiting for self-mark</span>
                <span className="spacer" />
                <Link className="linkbtn" href={base}>Close</Link>
              </div>
              <div className="tablebox">
                <table>
                  <thead><tr><th>Part</th>{current.sections.map((s) => <th key={s.code} className="num" title={s.title}>{s.code}</th>)}</tr></thead>
                  <tbody>
                    {current.parts.map((p) => (
                      <tr key={p.code}>
                        <td>{p.title.replace(/^Part \d+ – /, "")}</td>
                        {current.sections.map((s) => {
                          const a = selected.by_section?.[p.code + s.code];
                          return <td key={s.code} className="num">{a ? <Pct c={a.c} g={a.g} /> : <span className="muted">—</span>}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">Sections: {current.sections.map((s) => `${s.code} ${s.title.toLowerCase()}`).join(" · ")}</p>
              <h3>Missed questions ({missed.length})</h3>
              {missed.length === 0 ? <p className="muted">None so far.</p> : (
                <ol style={{ margin: 0, paddingLeft: "1.2em", display: "grid", gap: 4 }}>
                  {missed.slice(0, 60).map((m) => <li key={m.code}><b>{m.code}</b> <Sci text={m.stem.length > 110 ? m.stem.slice(0, 110) + "…" : m.stem} /></li>)}
                </ol>
              )}
              <form action={removeStudent}>
                <input type="hidden" name="class_id" value={classId} />
                <input type="hidden" name="user_id" value={selected.user_id} />
                <button className="btn bad" type="submit">Remove from class</button>
              </form>
            </section>
          )}

          {current.topics.length > 0 && (
            <section className="panel">
              <h2>Accuracy by rules topic</h2>
              <div className="tablebox">
                <table>
                  <thead><tr><th>Topic</th><th className="num">Graded answers</th><th className="num">Class accuracy</th></tr></thead>
                  <tbody>
                    {current.topics.map((t) => {
                      const a = topicAgg[t.code];
                      return (
                        <tr key={t.code}>
                          <td>{t.title}</td>
                          <td className="num">{a?.g ?? 0}</td>
                          <td className="num">{a ? <Pct c={a.c} g={a.g} /> : <span className="muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="panel">
            <h2>Most-missed questions</h2>
            {hardest.length === 0 ? <p className="muted">Not enough answers yet (each question needs at least 2 graded tries).</p> : (
              <div className="tablebox">
                <table>
                  <thead><tr><th>Question</th><th className="num">Missed</th></tr></thead>
                  <tbody>
                    {hardest.map((h) => (
                      <tr key={h.question_id}>
                        <td><b>{h.code}</b> <Sci text={h.stem.length > 120 ? h.stem.slice(0, 120) + "…" : h.stem} /></td>
                        <td className="num">{h.missed} of {h.graded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
