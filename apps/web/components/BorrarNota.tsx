"use client";

import { useState, useTransition } from "react";
import { borrarNota } from "../app/actions";

/**
 * Borrar en dos clics: el primero pide confirmación en el mismo botón,
 * sin diálogos del navegador.
 */
export function BorrarNota({ tareaId, notaId }: { tareaId: string; notaId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function clic() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    iniciar(async () => {
      const r = await borrarNota(tareaId, notaId);
      if (!r.ok) {
        setError(r.error);
        setConfirmando(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className={`nota-borrar${confirmando ? " nota-borrar-confirmar" : ""}`}
        onClick={clic}
        onBlur={() => setConfirmando(false)}
        disabled={pendiente}
      >
        {pendiente ? "Borrando" : confirmando ? "¿Borrar?" : "Eliminar"}
      </button>
      {error && <span className="form-error">{error}</span>}
    </>
  );
}
