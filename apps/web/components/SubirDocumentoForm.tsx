"use client";

import { useRef, useState, type FormEvent } from "react";
import { TIPOS_DOCUMENTO_PERMITIDOS } from "@tablero/core";
import { confirmarSubida, crearLinkSubida } from "../app/documentos/actions";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

export function SubirDocumentoForm({ carpetas }: { carpetas: string[] }) {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function subir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setExito(false);

    const formData = new FormData(evento.currentTarget);
    const archivo = formData.get("archivo");
    const nombreLogico = String(formData.get("nombre_logico") ?? "").trim();
    const carpetaCruda = String(formData.get("carpeta") ?? "").trim();
    const carpeta = carpetaCruda || null;

    if (!(archivo instanceof File) || archivo.size === 0) {
      setError("Elegí un archivo para subir.");
      return;
    }

    setPendiente(true);
    try {
      const datos = {
        carpeta,
        nombreLogico,
        nombreArchivo: archivo.name,
        tipo: archivo.type || "application/octet-stream",
        tamanoBytes: archivo.size,
      };

      const preparado = await crearLinkSubida(datos);
      if (!preparado.ok) {
        setError(preparado.error);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: errorSubida } = await supabase.storage
        .from("documentos")
        .uploadToSignedUrl(preparado.storagePath, preparado.token, archivo);

      if (errorSubida) {
        setError(`No se pudo subir el archivo: ${errorSubida.message}`);
        return;
      }

      const confirmado = await confirmarSubida({
        ...datos,
        storagePath: preparado.storagePath,
      });
      if (confirmado.error) {
        setError(confirmado.error);
        return;
      }

      setExito(true);
      formRef.current?.reset();
    } finally {
      setPendiente(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={subir} className="documento-form">
      <label>
        Carpeta (opcional)
        <input name="carpeta" list="carpetas-existentes" placeholder="ej: Casos de uso" />
        <datalist id="carpetas-existentes">
          {carpetas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label>
        Nombre del documento
        <input name="nombre_logico" required placeholder="ej: Journey de IA" />
      </label>
      <label>
        Archivo
        <input
          name="archivo"
          type="file"
          required
          accept={TIPOS_DOCUMENTO_PERMITIDOS.join(",")}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      {exito && <p className="documento-exito">Documento subido correctamente.</p>}
      <button type="submit" disabled={pendiente}>
        {pendiente ? "Subiendo…" : "Subir"}
      </button>
    </form>
  );
}
