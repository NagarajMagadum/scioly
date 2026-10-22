import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Classes" };

async function createClass(formData: FormData) {
  "use server";
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) redirect("/classes?error=name");
  const { data, error } = await supabase.from("classes").insert({ name, owner_id: user.id }).select("id").single();
  if (error) redirect(`/classes?error=${encodeURIComponent(error.message)}`);
  redirect(`/classes/${data.id}`);
}

async function joinClass(formData: FormData) {
  "use server";
  const { supabase } = await getUser();
  const code = String(formData.get("code") ?? "").trim();
  const { data, error } = await supabase.rpc("join_class", { p_code: code });
  if (error) redirect(`/classes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/classes");
  redirect(`/classes/${data}`);
}

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, user } = await getUser();
  const { data: memberships } = await supabase
    .from("class_members")
    .select("role, class:classes(id, name, join_code)")
    .eq("user_id", user!.id);

  const rows = (memberships ?? [])
    .map((m) => ({ role: m.role as string, cls: Array.isArray(m.class) ? m.class[0] : m.class }))
    .filter((m) => m.cls) as { role: string; cls: { id: string; name: string; join_code: string } }[];

  return (
    <>
      <h1>Classes</h1>
      {error && <p className="error">{error === "name" ? "Give the class a name." : error}</p>}
      <section className="panel">
        <h2>Your classes</h2>
        {rows.length === 0 ? (
          <p className="muted">You aren&apos;t in a class yet. Join one with the code from your coach, or create one if you&apos;re coaching.</p>
        ) : (
          <div className="tablebox">
            <table>
              <thead><tr><th>Class</th><th>Your role</th><th>Join code</th></tr></thead>
              <tbody>
                {rows.map(({ role, cls }) => (
                  <tr key={cls.id}>
                    <td><Link href={`/classes/${cls.id}`}>{cls.name}</Link></td>
                    <td>{role === "teacher" ? "Coach" : "Student"}</td>
                    <td className="num">{role === "teacher" ? cls.join_code : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="cards">
        <form action={joinClass} className="panel">
          <h2>Join a class</h2>
          <label htmlFor="code">Class code from your coach</label>
          <input id="code" name="code" type="text" required maxLength={12} autoComplete="off" placeholder="e.g. 7F3K2Q" style={{ textTransform: "uppercase", fontFamily: "var(--f-mono)" }} />
          <div><button className="btn primary" type="submit">Join</button></div>
        </form>
        <form action={createClass} className="panel">
          <h2>Create a class</h2>
          <label htmlFor="name">Class name</label>
          <input id="name" name="name" type="text" required maxLength={80} placeholder="e.g. A&P Div B 2026–27" />
          <div><button className="btn primary" type="submit">Create class</button></div>
          <p className="hint">You&apos;ll get a code to share with students.</p>
        </form>
      </div>
    </>
  );
}
