"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  TAMANO_MAXIMO_DOCUMENTO_BYTES,
  TIPOS_DOCUMENTO_PERMITIDOS,
} from "@tablero/core";
import {
  generarLinkDescarga,
  registrarDocumento,
} from "@tablero/db/documentos";
import { requireUser } from "../../lib/auth";

export interface SubirDocumentoState {
  error: string | null;
}

function extension(nombreArchivo: string): string {
  const punto = nombreArchivo.lastIndexOf(".");
  return punto === -1 ? "" : nombreArchivo.slice(punto).toLowerCase();
}

export async function subirDocumento(
  _estado: SubirDocumentoState,
  formData: FormData,
): Promise<SubirDocumentoState> {
  await requireUser();

  const archivo = formData.get("archivo");
  const nombreLogico = String(formData.get("nombre_logico") ?? "").trim();
  const carpetaCruda = String(formData.get("carpeta") ?? "").trim();
  const carpeta = carpetaCruda || null;

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elegí un archivo para subir." };
  }
  if (!nombreLogico) {
    return { error: "Ponele un nombre al documento." };
  }

  const ext = extension(archivo.name);
  if (
    !(TIPOS_DOCUMENTO_PERMITIDOS as readonly string[]).includes(ext)
  ) {
    return {
      error: `Tipo de archivo no permitido (${ext || "sin extensión"}). Permitidos: ${TIPOS_DOCUMENTO_PERMITIDOS.join(", ")}.`,
    };
  }
  if (archivo.size > TAMANO_MAXIMO_DOCUMENTO_BYTES) {
    return { error: "El archivo supera el tamaño máximo permitido (25MB)." };
  }

  const storagePath = `${randomUUID()}-${archivo.name}`;

  try {
    const contenido = await archivo.arrayBuffer();
    await registrarDocumento({
      carpeta,
      nombre_logico: nombreLogico,
      nombre_archivo: archivo.name,
      storage_path: storagePath,
      tipo: archivo.type || "application/octet-stream",
      tamano_bytes: archivo.size,
      contenido,
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
