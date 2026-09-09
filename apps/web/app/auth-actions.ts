"use server";

import { redirect } from "next/navigation";
import { env } from "../lib/env";
import { createSupabaseServerClient } from "../lib/supabase/server";

export interface LoginState {
  error: string | null;
}

export async function login(
  _estado: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Completá email y contraseña." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Email o contraseña incorrectos." };

  if (data.user.email?.trim().toLowerCase() !== env("ADMIN_EMAIL").toLowerCase()) {
    await supabase.auth.signOut();
    return { error: "La cuenta no está autorizada." };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
