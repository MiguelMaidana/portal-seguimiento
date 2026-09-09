"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarTarea,
  agregarTarea,
  completarTarea,
} from "@tablero/db";
import type { Estado } from "@tablero/core";
import { requireUser } from "../lib/auth";

/**
 * Captura rápida desde la web. Un solo campo: el título.
 * Clasificar después es más barato que clasificar al anotar, que es
 * justamente donde se pierde la costumbre de anotar.
 */
export async function capturar(titulo: string) {
  await requireUser();
  const limpio = titulo.trim();
  if (!limpio) return { ok: false, error: "Escribí algo para anotar." };

  try {
    await agregarTarea({ titulo: limpio }, "web");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function marcarHecha(id: string) {
  await requireUser();
  try {
    await completarTarea(id, "web");
    revalidatePath("/");
    revalidatePath("/metricas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function cambiarEstado(id: string, estado: Estado) {
  await requireUser();
  try {
    await actualizarTarea({ tarea: id, estado }, "web");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
