"use client";
import { useEffect, useRef, useState } from "react";

type Sample = { system: string; color: string; stem: string; options: string[]; answer: number; why: string };

const SAMPLES: Sample[] = [
  {
    system: "Respiratory",
    color: "var(--teal)",
    stem: "Which part of your lungs actually swaps oxygen into your blood?",
    options: ["Trachea", "Bronchi", "Alveoli", "Diaphragm"],
    answer: 2,
    why: "Alveoli are tiny air sacs with walls just one cell thick, wrapped in capillaries. Your lungs hold hundreds of millions of them.",
  },
  {
    system: "Digestive",
    color: "var(--sun-ink)",
    stem: "Where does the digestion of starch (like bread or rice) begin?",
    options: ["Mouth", "Stomach", "Small intestine", "Large intestine"],
    answer: 0,
    why: "Salivary amylase in your mouth starts breaking starch into sugars. Chew a cracker long enough and it starts to taste sweet.",
  },
  {
    system: "Immune",
    color: "var(--coral)",
    stem: "Which white blood cell is usually first to arrive at an infection?",
    options: ["B cell", "Neutrophil", "Plasma cell", "Red blood cell"],
    answer: 1,
    why: "Neutrophils are the most common white blood cells and rush in within hours. Pus is mostly neutrophils that did their job.",
  },
];

export default function TryQuestion() {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const burst = useRef<HTMLDivElement>(null);
  const q = SAMPLES[i];
  const done = pick !== null;
  const right = pick === q.answer;

  useEffect(() => {
    if (!done || !right || !burst.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = burst.current;
    const colors = ["var(--teal)", "var(--coral)", "var(--sun)", "var(--sky)"];
    for (let n = 0; n < 26; n++) {
      const s = document.createElement("span");
      s.className = "spark";
      const angle = (Math.PI * 2 * n) / 26;
      const dist = 60 + Math.random() * 70;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist - 30}px`);
      s.style.background = colors[n % colors.length];
      host.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }, [done, right]);

  function choose(n: number) {
    if (done) return;
    setPick(n);
    setStreak((s) => (n === q.answer ? s + 1 : 0));
  }
  function next() {
    setPick(null);
    setI((x) => (x + 1) % SAMPLES.length);
  }

  return (
    <section className="try" aria-labelledby="try-title" style={{ ["--sys" as string]: q.color }}>
      <div className="try-head">
        <span id="try-title" className="try-label">Try one now</span>
        <span className="try-system">{q.system}</span>
        <span className="spacer" />
        <span className="streak" aria-label={`Streak: ${streak}`}>
          <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path fill="currentColor" d="M7 0c.6 2.6 3.9 4.3 3.9 8.2A3.9 3.9 0 0 1 7 12.1a3.9 3.9 0 0 1-3.9-3.9c0-1.6.8-2.7 1.6-3.6.1 1.3.8 2.2 1.7 2.2C7.6 6.8 6.4 3.4 7 0Zm0 16c-3.3 0-6-2.4-6-5.6 0-.6.1-1.2.3-1.7.5 2.9 3 4.9 5.7 4.9s5.2-2 5.7-4.9c.2.5.3 1.1.3 1.7C13 13.6 10.3 16 7 16Z"/></svg>
          {streak}
        </span>
      </div>
      <p className="try-stem">{q.stem}</p>
      <div className="try-opts" role="group" aria-label="Answer choices">
        {q.options.map((o, n) => {
          const cls = !done ? "" : n === q.answer ? "right" : n === pick ? "wrong" : "dim";
          return (
            <button key={o} type="button" className={`try-opt ${cls}`} disabled={done} onClick={() => choose(n)}>
              <span className="k">{"ABCD"[n]}</span>
              {o}
            </button>
          );
        })}
      </div>
      <div className="burst" ref={burst} aria-hidden="true" />
      <div aria-live="polite">
        {done && (
          <div className={`try-fb ${right ? "ok" : "no"}`}>
            <p className="verdict">{right ? "Nailed it!" : `Not quite. It's ${q.options[q.answer]}.`}</p>
            <p>{q.why}</p>
            <button type="button" className="btn small" onClick={next}>Next question →</button>
          </div>
        )}
      </div>
    </section>
  );
}
