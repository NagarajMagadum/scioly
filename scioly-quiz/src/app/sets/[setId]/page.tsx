import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import type { Latest, Question, QuestionSet } from "@/lib/types";
import QuizPlayer from "./QuizPlayer";

export const metadata: Metadata = { title: "Quiz" };

const QUESTION_COLUMNS =
  "id, code, position, part, section, qtype, points, tiebreaker, pre, stem, after_text, table_data, options, match_left, match_choices, tags";

export default async function SetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const { supabase, user } = await getUser();

  const { data: set } = await supabase
    .from("question_sets")
    .select("id, slug, title, description, parts, sections, topics, subject:subjects(name, slug)")
    .eq("id", setId)
    .maybeSingle();
  if (!set) notFound();

  // Page through questions; PostgREST returns at most 1,000 rows per request.
  const questions: Question[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("questions")
      .select(QUESTION_COLUMNS)
      .eq("set_id", setId)
      .order("position")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    questions.push(...((data ?? []) as Question[]));
    if (!data || data.length < 1000) break;
  }

  const latest: Latest[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("latest_attempts")
      .select("id, question_id, correct, response")
      .eq("set_id", setId)
      .eq("user_id", user!.id)
      .range(from, from + 999);
    latest.push(...((data ?? []) as Latest[]));
    if (!data || data.length < 1000) break;
  }

  const subject = Array.isArray(set.subject) ? set.subject[0] : set.subject;
  return <QuizPlayer set={{ ...(set as unknown as QuestionSet), subject: subject ?? null }} questions={questions} latest={latest} />;
}
