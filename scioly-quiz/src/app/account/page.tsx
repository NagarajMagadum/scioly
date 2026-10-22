import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

async function saveName(formData: FormData) {
  "use server";
  const { supabase, user } = await getUser();
  if (!user) return;
  const name = String(formData.get("display_name") ?? "").trim().slice(0, 60);
  await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  revalidatePath("/account");
}

export default async function AccountPage() {
  const { supabase, user } = await getUser();
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user!.id).single();
  return (
    <section className="panel" style={{ maxWidth: 520 }}>
      <h1>Account</h1>
      <p className="muted">Signed in as {user!.email}</p>
      <form action={saveName} className="stack">
        <label htmlFor="display_name">Name your coach sees</label>
        <input id="display_name" name="display_name" type="text" maxLength={60} defaultValue={profile?.display_name ?? ""} placeholder="First name and last initial" />
        <div><button className="btn primary" type="submit">Save name</button></div>
      </form>
    </section>
  );
}
