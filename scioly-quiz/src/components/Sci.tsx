import { sciHtml } from "@/lib/format";

/** Renders trusted question text with scientific subscripts. Text is escaped first. */
export function Sci({ text, as: Tag = "span", className }: { text: string | null | undefined; as?: "span" | "p" | "div"; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: sciHtml(text) }} />;
}
