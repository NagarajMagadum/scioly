const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escape text, then add subscripts for common chemistry and physiology notation (CO2, PO2, HCO3, FEV1). */
export function sciHtml(text: string | null | undefined): string {
  return escapeHtml(text ?? "")
    .replace(/H2CO3/g, "H<sub>2</sub>CO<sub>3</sub>")
    .replace(/HCO3/g, "HCO<sub>3</sub>")
    .replace(/(^|[^A-Za-z0-9])H2O\b/g, "$1H<sub>2</sub>O")
    .replace(/CO2/g, "CO<sub>2</sub>")
    .replace(/(^|[^A-Za-z0-9])(Pa|P|Sp)?O2\b/g, (_m, a: string, b: string | undefined) => `${a}${b ?? ""}O<sub>2</sub>`)
    .replace(/(^|[^A-Za-z0-9])N2\b/g, "$1N<sub>2</sub>")
    .replace(/FEV1/g, "FEV<sub>1</sub>");
}

export function pct(correct: number, graded: number): number | null {
  return graded > 0 ? Math.round((100 * correct) / graded) : null;
}

export function ago(iso: string | null): string {
  if (!iso) return "Not started";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString();
}
