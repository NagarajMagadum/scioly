// Load a question-set JSON file (made by scripts/bank_to_json.py) into Supabase.
// Usage: node --env-file=.env.local scripts/import-questions.mjs content/ap-divb-2026.json [--prune] [--unpublished]
//   --prune        delete questions in this set whose code is no longer in the file (their attempts go too)
//   --unpublished  load the set hidden from students (publish later by setting published = true)
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). Run on your own computer only.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
const prune = process.argv.includes("--prune");
const published = !process.argv.includes("--unpublished");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!file) fail("Give the JSON file to import, e.g. content/ap-divb-2026.json");
if (!url || !key) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

const db = createClient(url, key, { auth: { persistSession: false } });
const data = JSON.parse(await readFile(file, "utf8"));
const { subject, set, questions } = data;
if (!subject?.slug || !set?.slug || !Array.isArray(questions)) fail("File is missing subject, set or questions");

const codes = new Set();
for (const q of questions) {
  if (codes.has(q.code)) fail(`Duplicate question code ${q.code}`);
  codes.add(q.code);
  if (!["mc", "multi", "tf", "match", "free"].includes(q.qtype)) fail(`${q.code}: unknown type ${q.qtype}`);
}

const subj = await must(
  db.from("subjects").upsert({ slug: subject.slug, name: subject.name }, { onConflict: "slug" }).select("id").single(),
  "save subject",
);
const qs = await must(
  db
    .from("question_sets")
    .upsert(
      {
        subject_id: subj.id,
        slug: set.slug,
        title: set.title,
        description: set.description ?? "",
        parts: set.parts ?? [],
        sections: set.sections ?? [],
        topics: set.topics ?? [],
        published,
      },
      { onConflict: "subject_id,slug" },
    )
    .select("id")
    .single(),
  "save question set",
);

const BATCH = 200;
let saved = 0;
for (let i = 0; i < questions.length; i += BATCH) {
  const chunk = questions.slice(i, i + BATCH);
  const rows = chunk.map((q) => ({
    set_id: qs.id,
    code: q.code,
    position: q.position,
    part: q.part,
    section: q.section,
    qtype: q.qtype,
    points: q.points,
    tiebreaker: !!q.tiebreaker,
    pre: q.pre ?? null,
    stem: q.stem,
    after_text: q.after_text ?? [],
    table_data: q.table_data ?? null,
    options: q.options ?? null,
    match_left: q.match_left ?? null,
    match_choices: q.match_choices ?? null,
    tags: q.tags ?? [],
  }));
  const ids = await must(db.from("questions").upsert(rows, { onConflict: "set_id,code" }).select("id, code"), "save questions");
  const idByCode = Object.fromEntries(ids.map((r) => [r.code, r.id]));
  const keys = chunk.map((q) => ({
    question_id: idByCode[q.code],
    key: q.key ?? [],
    answer_text: q.answer_text ?? "",
    explanation: q.explanation ?? "",
  }));
  await must(db.from("question_keys").upsert(keys, { onConflict: "question_id" }), "save answer keys");
  saved += chunk.length;
  process.stdout.write(`\rSaved ${saved} of ${questions.length} questions`);
}
process.stdout.write("\n");

if (prune) {
  const existing = await must(db.from("questions").select("id, code").eq("set_id", qs.id).range(0, 9999), "list questions");
  const stale = existing.filter((r) => !codes.has(r.code)).map((r) => r.id);
  if (stale.length) await must(db.from("questions").delete().in("id", stale), "remove old questions");
  console.log(`Removed ${stale.length} questions no longer in the file`);
}
console.log(`Done: "${set.title}" (${published ? "published" : "hidden"}) has ${questions.length} questions.`);

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) fail(`Couldn't ${what}: ${error.message}`);
  return data;
}
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
