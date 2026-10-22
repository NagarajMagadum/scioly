import { pct } from "@/lib/format";

export function Pct({ c, g }: { c: number; g: number }) {
  const v = pct(c, g);
  if (v === null) return <span className="muted">—</span>;
  const tone = v >= 80 ? "hi" : v < 60 ? "lo" : "mid";
  return <span className={`pct ${tone}`}>{v}%</span>;
}
