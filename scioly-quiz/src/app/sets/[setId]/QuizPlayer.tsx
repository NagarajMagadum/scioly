"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sci } from "@/components/Sci";
import type { GradeResult, Latest, Question, QuestionSet, Response } from "@/lib/types";

const LETTERS = "abcdefgh";
const PART_COLORS = ["var(--p1)", "var(--p2)", "var(--p3)", "var(--p4)"];

type Status = { correct: boolean | null; attemptId: string };
type Draft = { value?: string; values?: string[]; text?: string };

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export default function QuizPlayer({ set, questions, latest }: { set: QuestionSet; questions: Question[]; latest: Latest[] }) {
  const supabase = useMemo(() => createClient(), []);
  const partColor = useMemo(
    () => Object.fromEntries(set.parts.map((p, i) => [p.code, PART_COLORS[i % PART_COLORS.length]])),
    [set.parts],
  );
  const partTitle = useMemo(() => Object.fromEntries(set.parts.map((p) => [p.code, p.title])), [set.parts]);
  const secTitle = useMemo(() => Object.fromEntries(set.sections.map((s) => [s.code, s.title])), [set.sections]);

  const [status, setStatus] = useState<Record<string, Status>>(() =>
    Object.fromEntries(latest.map((l) => [l.question_id, { correct: l.correct, attemptId: l.id }])),
  );
  const [part, setPart] = useState("all");
  const [section, setSection] = useState("all");
  const [show, setShow] = useState<"all" | "todo" | "missed">("all");
  const [order, setOrder] = useState<"seq" | "shuf">("seq");
  const [seed, setSeed] = useState(1);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The filtered list is frozen while answering so a just-answered question doesn't vanish from "Not yet answered".
  const [listKey, setListKey] = useState(0);
  const list = useMemo(() => {
    let l = questions.filter((q) => (part === "all" || q.part === part) && (section === "all" || q.section === section));
    if (show === "todo") l = l.filter((q) => !status[q.id]);
    if (show === "missed") l = l.filter((q) => status[q.id]?.correct === false);
    if (order === "shuf") l = seededShuffle(l, seed);
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, part, section, show, order, seed, listKey]);

  const idx = Math.max(0, list.findIndex((q) => q.id === currentId));
  const q: Question | undefined = list[idx];
  const prior = q ? status[q.id] : undefined;

  useEffect(() => {
    setDraft({});
    setResult(null);
    setError(null);
  }, [q?.id]);

  const scope = useMemo(
    () => questions.filter((x) => (part === "all" || x.part === part) && (section === "all" || x.section === section)),
    [questions, part, section],
  );
  const score = useMemo(() => {
    let graded = 0, correct = 0, answered = 0;
    for (const x of scope) {
      const s = status[x.id];
      if (!s) continue;
      answered++;
      if (s.correct !== null) { graded++; if (s.correct) correct++; }
    }
    return { graded, correct, answered };
  }, [scope, status]);

  const go = useCallback((delta: number) => {
    const next = list[idx + delta];
    if (next) { setCurrentId(next.id); window.scrollTo(0, 0); }
  }, [list, idx]);

  function changeFilter(fn: () => void) {
    fn();
    setCurrentId(null);
    setListKey((k) => k + 1);
  }

  const ready = (() => {
    if (!q) return false;
    if (q.qtype === "mc" || q.qtype === "tf") return !!draft.value;
    if (q.qtype === "multi") return (draft.values?.length ?? 0) > 0;
    if (q.qtype === "match") return (draft.values?.length ?? 0) === (q.match_left?.length ?? 0) && draft.values!.every(Boolean);
    return true;
  })();

  async function submit() {
    if (!q || !ready || busy) return;
    setBusy(true);
    setError(null);
    const response: Response =
      q.qtype === "mc" || q.qtype === "tf" ? { value: draft.value! }
      : q.qtype === "free" ? { text: (draft.text ?? "").slice(0, 4000) }
      : { values: draft.values ?? [] };
    const { data, error } = await supabase.rpc("submit_answer", { p_question: q.id, p_response: response });
    setBusy(false);
    if (error) { setError(`Couldn't check your answer: ${error.message}`); return; }
    const r = data as GradeResult;
    setResult(r);
    setStatus((s) => ({ ...s, [q.id]: { correct: r.correct, attemptId: r.attempt_id } }));
  }

  async function selfMark(correct: boolean) {
    if (!q || !result) return;
    const { error } = await supabase.rpc("self_mark", { p_attempt: result.attempt_id, p_correct: correct });
    if (error) { setError(`Couldn't save your mark: ${error.message}`); return; }
    setResult({ ...result, correct });
    setStatus((s) => ({ ...s, [q.id]: { correct, attemptId: result.attempt_id } }));
  }

  function toggle(k: string) {
    if (result || !q) return;
    if (q.qtype === "multi") {
      const v = draft.values ?? [];
      setDraft({ values: v.includes(k) ? v.filter((x) => x !== k) : [...v, k].sort() });
    } else setDraft({ value: k });
  }

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey || !q) return;
      if (e.key === "ArrowRight") return go(1);
      if (e.key === "ArrowLeft") return go(-1);
      if (e.key === "Enter") {
        e.preventDefault();
        if (result) { if (result.correct !== null) go(1); } else void submit();
        return;
      }
      if (result) return;
      const k = e.key.toLowerCase();
      if (q.qtype === "tf" && (k === "t" || k === "f")) setDraft({ value: k === "t" ? "True" : "False" });
      if ((q.qtype === "mc" || q.qtype === "multi") && q.options && LETTERS.indexOf(k) > -1 && LETTERS.indexOf(k) < q.options.length) toggle(k);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const matchChoices = useMemo(() => {
    if (!q?.match_choices) return [];
    const described = q.match_choices.some((c) => c[1]);
    return described ? seededShuffle(q.match_choices, hash(q.code)) : q.match_choices;
  }, [q]);

  const sys = q ? partColor[q.part] ?? "var(--accent)" : "var(--accent)";

  return (
    <div className="stack">
      <div className="panel">
        <div className="row">
          <div>
            <span className="eyebrow">{set.subject?.name}</span>
            <h1>{set.title}</h1>
          </div>
          <span className="spacer" />
          <span className="hint">
            <b>{score.correct}</b> correct of <b>{score.graded}</b> graded{score.graded ? ` (${Math.round((100 * score.correct) / score.graded)}%)` : ""} · {score.answered} of {scope.length} answered
          </span>
        </div>
        <div className="controls">
          <div className="row" role="group" aria-label="Part">
            {[{ code: "all", title: "All parts" }, ...set.parts].map((p) => (
              <button key={p.code} type="button" className="chip" aria-pressed={part === p.code} onClick={() => changeFilter(() => setPart(p.code))}>
                {p.title.replace(/^Part \d+ – /, "")}
              </button>
            ))}
          </div>
          <select aria-label="Section" value={section} onChange={(e) => changeFilter(() => setSection(e.target.value))}>
            <option value="all">All sections</option>
            {set.sections.map((s) => <option key={s.code} value={s.code}>{s.code}. {s.title}</option>)}
          </select>
          <select aria-label="Which questions" value={show} onChange={(e) => changeFilter(() => setShow(e.target.value as typeof show))}>
            <option value="all">All questions</option>
            <option value="todo">Not yet answered</option>
            <option value="missed">Missed only</option>
          </select>
          <select aria-label="Order" value={order} onChange={(e) => changeFilter(() => { setOrder(e.target.value as typeof order); setSeed(Date.now() % 100000 + 1); })}>
            <option value="seq">In order</option>
            <option value="shuf">Shuffled</option>
          </select>
        </div>
        <div className="progress" aria-hidden="true"><i style={{ width: `${scope.length ? (100 * score.answered) / scope.length : 0}%` }} /></div>
      </div>

      {!q ? (
        <div className="card"><p className="muted" style={{ textAlign: "center", padding: 24 }}>
          {show === "missed" ? "No missed questions here." : show === "todo" ? "You've answered every question in this set." : "No questions match these filters."}
        </p></div>
      ) : (
        <article className="card" style={{ ["--sys" as string]: sys }} aria-live="polite">
          <div className="meta">
            <span className="qid">{q.code}</span>
            <span>{(partTitle[q.part] ?? q.part).replace(/^Part \d+ – /, "")} · {secTitle[q.section] ?? q.section}</span>
            <span>{q.points} pt{q.points === 1 ? "" : "s"}</span>
            {q.tiebreaker && <span className="tb">TB</span>}
            <span className="count">{idx + 1} of {list.length}</span>
          </div>
          {q.pre && <Sci as="p" className="pre" text={q.pre} />}
          <Sci as="p" className="stem" text={q.stem} />
          {q.qtype !== "match" && q.table_data && q.table_data.length > 0 && <DataTable rows={q.table_data} />}
          {q.after_text.map((t, i) => <Sci key={i} as="p" text={t} />)}

          {prior && !result && (
            <p className="notice">
              You answered this before and it was {prior.correct === true ? "correct" : prior.correct === false ? "missed" : "not yet self-marked"}. Answer again to update it.
            </p>
          )}

          {(q.qtype === "mc" || q.qtype === "multi") && q.options && (
            <div className={`opts ${q.qtype === "multi" ? "multi" : ""}`} role="group">
              {q.options.map((o, i) => {
                const k = LETTERS[i];
                const picked = q.qtype === "multi" ? (draft.values ?? []).includes(k) : draft.value === k;
                const isKey = result?.key.includes(k);
                const cls = result ? (isKey ? "right" : picked ? "wrong" : "") : picked ? "sel" : "";
                return (
                  <button key={k} type="button" className={`opt ${cls}`} disabled={!!result} aria-pressed={picked} onClick={() => toggle(k)}>
                    <span className="k">{k}</span><Sci text={o} />
                  </button>
                );
              })}
            </div>
          )}
          {q.qtype === "multi" && !result && <p className="hint">Select all that apply, then check.</p>}

          {q.qtype === "tf" && (
            <div className="tfrow">
              {["True", "False"].map((o) => {
                const picked = draft.value === o;
                const cls = result ? (result.key[0] === o ? "right" : picked ? "wrong" : "") : picked ? "sel" : "";
                return <button key={o} type="button" className={`opt ${cls}`} disabled={!!result} aria-pressed={picked} onClick={() => toggle(o)}>{o}</button>;
              })}
            </div>
          )}

          {q.qtype === "match" && q.match_left && (
            <div className="match">
              {q.match_left.map((l, i) => {
                const v = draft.values?.[i] ?? "";
                const ok = result ? v === result.key[i] : null;
                const label = (val: string) => {
                  const c = q.match_choices?.find((x) => x[0] === val);
                  return c ? (c[1] || c[0]) : val;
                };
                return (
                  <div key={i} className={`mrow ${ok === true ? "right" : ok === false ? "wrong" : ""}`}>
                    <Sci text={l} />
                    <select
                      aria-label={`Match for ${l}`}
                      value={v}
                      disabled={!!result}
                      onChange={(e) => {
                        const vals = [...(draft.values ?? q.match_left!.map(() => ""))];
                        vals[i] = e.target.value;
                        setDraft({ values: vals });
                      }}
                    >
                      <option value="">Choose…</option>
                      {matchChoices.map((c) => <option key={c[0]} value={c[0]}>{c[1] || c[0]}</option>)}
                    </select>
                    {ok === false && result && <span className="fix">Correct: {label(result.key[i])}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {q.qtype === "free" && (
            <>
              <label className="hint" htmlFor={`free-${q.id}`}>Write your answer, then reveal the model answer and mark yourself.</label>
              <textarea id={`free-${q.id}`} value={draft.text ?? ""} readOnly={!!result} onChange={(e) => setDraft({ text: e.target.value })} placeholder="Your answer" />
            </>
          )}

          {result && <Feedback q={q} r={result} onSelfMark={selfMark} />}
          {error && <p className="error">{error}</p>}

          <div className="row">
            {!result ? (
              <button type="button" className="btn primary" disabled={!ready || busy} onClick={submit}>
                {busy ? "Checking…" : q.qtype === "free" ? "Show answer" : "Check answer"}
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => { setDraft({}); setResult(null); }}>Try again</button>
                {idx < list.length - 1 && <button type="button" className="btn primary" onClick={() => go(1)}>Next question →</button>}
              </>
            )}
          </div>
        </article>
      )}

      <div className="row">
        <button type="button" className="btn" disabled={idx === 0} onClick={() => go(-1)}>← Previous</button>
        <button type="button" className="btn" disabled={idx >= list.length - 1} onClick={() => go(1)}>Next →</button>
        <span className="spacer" />
        <JumpBox onJump={(code) => {
          const target = questions.find((x) => x.code.toUpperCase() === code.toUpperCase());
          if (!target) return false;
          if (!list.some((x) => x.id === target.id)) { setPart("all"); setSection("all"); setShow("all"); setListKey((k) => k + 1); }
          setCurrentId(target.id);
          return true;
        }} />
      </div>
      <p className="hint">Keys: A–H pick an option · T/F · Enter checks or moves on · ← → change question</p>
    </div>
  );
}

function DataTable({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="tablebox">
      <table>
        <thead><tr>{head.map((c, i) => <th key={i}><Sci text={c} /></th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Sci text={c} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Feedback({ q, r, onSelfMark }: { q: Question; r: GradeResult; onSelfMark: (c: boolean) => void }) {
  if (q.qtype === "free") {
    return (
      <>
        <div className={`feedback ${r.correct === true ? "ok" : r.correct === false ? "no" : "self"}`}>
          <p className="verdict">{r.correct === true ? "Marked correct" : r.correct === false ? "Marked as missed" : "Model answer"}</p>
          <Sci as="p" text={r.answer} />
        </div>
        {r.correct === null && (
          <div className="row">
            <span className="hint">Compare with the model answer. Did you get it?</span>
            <button type="button" className="btn good" onClick={() => onSelfMark(true)}>I got it</button>
            <button type="button" className="btn bad" onClick={() => onSelfMark(false)}>I missed it</button>
          </div>
        )}
      </>
    );
  }
  let answer: string = "";
  if ((q.qtype === "mc" || q.qtype === "multi") && q.options) {
    answer = r.key.map((k) => `${k}) ${q.options![LETTERS.indexOf(k)] ?? ""}`).join("; ");
  } else if (q.qtype === "tf") answer = r.key[0] ?? "";
  const matchRight = q.qtype === "match" ? r.key.filter((_, i) => i < (q.match_left?.length ?? 0)).length : 0;
  return (
    <div className={`feedback ${r.correct ? "ok" : "no"}`}>
      <p className="verdict">{r.correct ? "Correct" : q.qtype === "match" ? "Some matches are wrong" : "Not quite"}</p>
      {answer && <p><b>Answer:</b> <Sci text={answer} /></p>}
      {q.qtype === "match" && !r.correct && matchRight > 0 && <p className="hint">The correct match is shown under each wrong row.</p>}
      {r.explanation && <Sci as="p" text={r.explanation} />}
    </div>
  );
}

function JumpBox({ onJump }: { onJump: (code: string) => boolean }) {
  const [v, setV] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <form
      className="row"
      onSubmit={(e) => { e.preventDefault(); const ok = onJump(v.trim()); setBad(!ok); if (ok) setV(""); }}
    >
      <label htmlFor="jump" className="hint">Go to</label>
      <input id="jump" type="text" value={v} onChange={(e) => { setV(e.target.value); setBad(false); }} placeholder="R12" style={{ width: "6em", fontFamily: "var(--f-mono)" }} aria-invalid={bad} />
      {bad && <span className="error">No question with that number</span>}
    </form>
  );
}
