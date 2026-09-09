import "server-only";

import { redirect } from "next/navigation";
import { env } from "./env";
import { createSupabaseServerClient } from "./supabase/server";

function esAdministrador(email: string | undefined): boolean {
  return email?.trim().toLowerCase() === env("ADMIN_EMAIL").toLowerCase();
}

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !esAdministrador(data.user.email)) {
    redirect("/login");
  }

  return data.user;
}
