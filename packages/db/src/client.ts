import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

let cliente: SupabaseClient | null = null;

function variable(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta configurar ${nombre}.`);
  return valor;
}

export function db(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(
      variable("NEXT_PUBLIC_SUPABASE_URL"),
      variable("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return cliente;
}

export function isoLocal(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

export function hoyLocal(fecha: Date = new Date()): Date {
  const [anio, mes, dia] = isoLocal(fecha).split("-").map(Number);
  return new Date(anio, mes - 1, dia, 12);
}
