import "server-only";

import { resolverNombreConDesambiguacion } from "@tablero/core";
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

export type ResolucionDocumento =
  | { tipo: "una"; nombreLogico: string }
  | { tipo: "varias"; candidatos: string[] }
  | { tipo: "ninguna" };

/**
 * Resuelve un nombre lógico por aproximación contra los que ya existen.
 * A diferencia de resolverArea/resolverPersona (que devuelven null si no
 * hay match), acá puede haber empate entre dos versiones de nombres
 * parecidos ("Journey de IA 2025" vs "Journey de IA 2026"), así que
 * devolvemos "varias" para que quien llama pregunte en vez de elegir
 * a ciegas.
 */
export async function resolverDocumento(
  nombre: string,
): Promise<ResolucionDocumento> {
  const { data, error } = await db()
    .from("documentos")
    .select("nombre_logico")
    .order("nombre_logico");

  if (error) {
    throw new Error(`No se pudo resolver el documento: ${error.message}`);
  }

  const nombres = [
    ...new Set((data ?? []).map((f) => f.nombre_logico as string)),
  ];
  if (nombres.length === 0) return { tipo: "ninguna" };

  const candidatos = nombres.map((n) => ({ nombre_logico: n }));
  const resuelto = resolverNombreConDesambiguacion(
    nombre,
    candidatos,
    (c) => [c.nombre_logico],
  );

  if (resuelto.tipo === "ninguna") return { tipo: "ninguna" };
  if (resuelto.tipo === "varias") {
    return {
      tipo: "varias",
      candidatos: resuelto.items.map((i) => i.nombre_logico),
    };
  }
  return { tipo: "una", nombreLogico: resuelto.item.nombre_logico };
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
    // El archivo ya se subió a Storage; si el insert falla, lo borramos
    // para no dejar un objeto huérfano sin registro en la tabla.
    await db().storage.from(BUCKET).remove([entrada.storage_path]);
    throw new Error(`No se pudo registrar el documento: ${error.message}`);
  }
  return data as Documento;
}

export async function crearSubidaFirmada(
  storagePath: string,
): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await db()
    .storage.from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error) {
    throw new Error(`No se pudo preparar la subida: ${error.message}`);
  }
  return { signedUrl: data.signedUrl, token: data.token };
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
    .createSignedUrl(doc.storage_path, 60, { download: doc.nombre_archivo });

  if (error) {
    throw new Error(`No se pudo generar el link: ${error.message}`);
  }
  return { url: data.signedUrl, nombreArchivo: doc.nombre_archivo };
}
