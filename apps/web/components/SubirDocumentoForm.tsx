"use client";

import { useActionState } from "react";
import { TIPOS_DOCUMENTO_PERMITIDOS } from "@tablero/core";
import {
  subirDocumento,
  type SubirDocumentoState,
} from "../app/documentos/actions";

const initialState: SubirDocumentoState = { error: null };

export function SubirDocumentoForm({ carpetas }: { carpetas: string[] }) {
  const [state, action, pending] = useActionState(subirDocumento, initialState);

  return (
    <form action={action} className="documento-form">
      <label>
        Carpeta (opcional)
        <input
          name="carpeta"
          list="carpetas-existentes"
          placeholder="ej: Casos de uso"
        />
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
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Subiendo…" : "Subir"}
      </button>
    </form>
  );
}
