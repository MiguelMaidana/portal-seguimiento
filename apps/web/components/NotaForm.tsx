"use client";

import { useState, useTransition } from "react";
import { anotar } from "../app/actions";

/** Agregar una nota a la bitácora de una tarea. Ctrl/Cmd+Enter guarda. */
export function NotaForm({ tareaId }: { tareaId: string }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    const valor = texto.trim();
    if (!valor) return;

    iniciar(async () => {
      const r = await anotar(tareaId, valor);
      if (r.ok) {
        setTexto("");
        setError(null);
      } else {
        setError(r.error ?? "No se pudo guardar la nota.");
      }
    });
  }

  return (
    <div className="nota-form">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) guardar();
        }}
        placeholder="Qué pasó, qué se acordó, próximos pasos…"
        aria-label="Nueva nota"
        rows={3}
        disabled={pendiente}
      />
      <div className="nota-form-pie">
        {error && <p className="form-error">{error}</p>}
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !texto.trim()}
        >
          {pendiente ? "Guardando" : "Agregar nota"}
        </button>
      </div>
    </div>
  );
}
