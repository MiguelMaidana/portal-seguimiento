"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  TAMANO_MAXIMO_DOCUMENTO_BYTES,
  TIPOS_DOCUMENTO_PERMITIDOS,
} from "@tablero/core";
import {
  crearSubidaFirmada,
  generarLinkDescarga,
  registrarDocumento,
} from "@tablero/db/documentos";
import { requireUser } from "../../lib/auth";

function extension(nombreArchivo: string): string {
  const punto = nombreArchivo.lastIndexOf(".");
  return punto === -1 ? "" : nombreArchivo.slice(punto).toLowerCase();
}

/** Nombre de archivo sin separadores de ruta, para no pisar la carpeta del bucket. */
function nombreSeguro(nombreArchivo: string): string {
  return nombreArchivo.replace(/[/\\]/g, "_");
}

export interface DatosSubida {
  carpeta: string | null;
  nombreLogico: string;
  nombreArchivo: string;
  tipo: string;
  tamanoBytes: number;
}

export async function crearLinkSubida(
  input: DatosSubida,
): Promise<
  | { ok: true; signedUrl: string; token: string; storagePath: string }
  | { ok: false; error: string }
> {
  await requireUser();

  if (!input.nombreLogico.trim()) {
    return { ok: false, error: "Ponele un nombre al documento." };
  }

  const ext = extension(input.nombreArchivo);
  if (!(TIPOS_DOCUMENTO_PERMITIDOS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      error: `Tipo de archivo no permitido (${ext || "sin extensión"}). Permitidos: ${TIPOS_DOCUMENTO_PERMITIDOS.join(", ")}.`,
    };
  }
  if (input.tamanoBytes > TAMANO_MAXIMO_DOCUMENTO_BYTES) {
    return { ok: false, error: "El archivo supera el tamaño máximo permitido (25MB)." };
  }

  const storagePath = `${randomUUID()}-${nombreSeguro(input.nombreArchivo)}`;

  try {
    const { signedUrl, token } = await crearSubidaFirmada(storagePath);
    return { ok: true, signedUrl, token, storagePath };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function confirmarSubida(
  input: DatosSubida & { storagePath: string },
): Promise<{ error: string | null }> {
  await requireUser();

  try {
    await registrarDocumento({
      carpeta: input.carpeta,
      nombre_logico: input.nombreLogico,
      nombre_archivo: input.nombreArchivo,
      storage_path: input.storagePath,
      tipo: input.tipo,
      tamano_bytes: input.tamanoBytes,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }

  revalidatePath("/documentos");
  return { error: null };
}

export async function pedirLinkDescarga(
  documentoId: string,
): Promise<
  { ok: true; url: string; nombreArchivo: string } | { ok: false; error: string }
> {
  await requireUser();
  try {
    const resultado = await generarLinkDescarga(documentoId);
    if (!resultado) return { ok: false, error: "No se encontró el documento." };
    return { ok: true, url: resultado.url, nombreArchivo: resultado.nombreArchivo };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
