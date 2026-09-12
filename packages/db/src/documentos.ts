import "server-only";

import { resolverNombre } from "@tablero/core";
import { db } from "./client";

const BUCKET = "documentos";

export interface Documento {
  id: string;
  carpeta: string | null;
  nombre_logico: string;
  nombre_archivo: string;
  storage_path: string;
  tipo: string;
  tamano_bytes: number;
  subido_en: string;
}

export interface DocumentoAgrupado {
  nombre_logico: string;
  carpeta: string | null;
  ultima: Documento;
  anteriores: Documento[];
}

export interface NuevoDocumento {
  carpeta: string | null;
  nombre_logico: string;
  nombre_archivo: string;
  storage_path: string;
  tipo: string;
  tamano_bytes: number;
  contenido: ArrayBuffer;
}

export async function listarCarpetas(): Promise<string[]> {
  const { data, error } = await db()
    .from("documentos")
    .select("carpeta")
    .not("carpeta", "is", null);

  if (error) {
    throw new Error(`No se pudieron leer las carpetas: ${error.message}`);
  }

  const unicas = new Set(
    (data ?? []).map((f) => f.carpeta as string).filter(Boolean),
  );
  return [...unicas].sort((a, b) => a.localeCompare(b, "es"));
}

export async function listarDocumentos(
  carpeta?: string,
): Promise<DocumentoAgrupado[]> {
  let q = db()
    .from("documentos")
    .select("*")
    .order("subido_en", { ascending: false });

  if (carpeta) q = q.eq("carpeta", carpeta);

  const { data, error } = await q;
  if (error) {
    throw new Error(`No se pudieron leer los documentos: ${error.message}`);
  }

  const filas = (data ?? []) as Documento[];
  const grupos = new Map<string, Documento[]>();
  for (const fila of filas) {
    const lista = grupos.get(fila.nombre_logico) ?? [];
    lista.push(fila);
    grupos.set(fila.nombre_logico, lista);
  }

  return [...grupos.entries()]
    .map(([nombre_logico, versiones]) => ({
      nombre_logico,
      carpeta: versiones[0].carpeta,
      ultima: versiones[0],
      anteriores: versiones.slice(1),
    }))
    .sort((a, b) => b.ultima.subido_en.localeCompare(a.ultima.subido_en));
}

/**
 * Resuelve un nombre lógico por aproximación contra los que ya existen.
 * Igual mecanismo que resolverArea/resolverPersona en repo.ts.
 */
export async function resolverDocumento(
  nombre: string,
): Promise<string | null> {
  const { data, error } = await db().from("documentos").select("nombre_logico");
  if (error) {
    throw new Error(`No se pudo resolver el documento: ${error.message}`);
  }

  const nombres = [
    ...new Set((data ?? []).map((f) => f.nombre_logico as string)),
  ];
  if (nombres.length === 0) return null;

  const candidatos = nombres.map((n) => ({ nombre_logico: n }));
  const resuelto = resolverNombre(nombre, candidatos, (c) => [c.nombre_logico]);
  return resuelto?.nombre_logico ?? null;
}

export async function ultimaVersion(
  nombreLogico: string,
): Promise<Documento | null> {
  const { data, error } = await db()
    .from("documentos")
    .select("*")
    .eq("nombre_logico", nombreLogico)
    .order("subido_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo leer la última versión: ${error.message}`);
  }
  return (data as Documento) ?? null;
}

export async function historialVersiones(
  nombreLogico: string,
): Promise<Documento[]> {
  const { data, error } = await db()
    .from("documentos")
    .select("*")
    .eq("nombre_logico", nombreLogico)
    .order("subido_en", { ascending: false });

  if (error) {
    throw new Error(`No se pudo leer el historial: ${error.message}`);
  }
  return (data ?? []) as Documento[];
}

export async function registrarDocumento(
  entrada: NuevoDocumento,
): Promise<Documento> {
  const { error: errorSubida } = await db()
    .storage.from(BUCKET)
    .upload(entrada.storage_path, entrada.contenido, {
      contentType: entrada.tipo,
      upsert: false,
    });

  if (errorSubida) {
    throw new Error(`No se pudo subir el archivo: ${errorSubida.message}`);
  }

  const { data, error } = await db()
    .from("documentos")
    .insert({
      carpeta: entrada.carpeta,
      nombre_logico: entrada.nombre_logico,
      nombre_archivo: entrada.nombre_archivo,
      storage_path: entrada.storage_path,
      tipo: entrada.tipo,
      tamano_bytes: entrada.tamano_bytes,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`No se pudo registrar el documento: ${error.message}`);
  }
  return data as Documento;
}

export async function generarLinkDescarga(
  documentoId: string,
): Promise<{ url: string; nombreArchivo: string } | null> {
  const { data: fila, error: errorFila } = await db()
    .from("documentos")
    .select("*")
    .eq("id", documentoId)
    .maybeSingle();

  if (errorFila) {
    throw new Error(`No se pudo leer el documento: ${errorFila.message}`);
  }
  if (!fila) return null;

  const doc = fila as Documento;
  const { data, error } = await db()
    .storage.from(BUCKET)
    .createSignedUrl(doc.storage_path, 60);

  if (error) {
    throw new Error(`No se pudo generar el link: ${error.message}`);
  }
  return { url: data.signedUrl, nombreArchivo: doc.nombre_archivo };
}
