import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Entry point: signed-out → /login, no company yet → /setup, otherwise → /dashboard. */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle<{ company_id: string | null }>();
  redirect(data?.company_id ? "/dashboard" : "/setup");
}
