"use client";

import { useRef, useState, useTransition } from "react";
import { capturar } from "../app/actions";

/**
 * Un input y un botón. Si anotar cuesta más que eso, el tablero
 * pierde contra el cuaderno y contra el chat.
 */
export function Capture() {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  function enviar() {
    const valor = texto.trim();
    if (!valor) return;

    iniciar(async () => {
      const r = await capturar(valor);
      if (r.ok) {
        setTexto("");
        setError(null);
        campo.current?.focus();
      } else {
        setError(r.error ?? "No se pudo anotar.");
      }
    });
  }

  return (
    <div>
      <div className="capture">
        <input
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviar();
          }}
          placeholder="Anotar algo antes de que se pierda"
          aria-label="Anotar una tarea nueva"
          disabled={pendiente}
        />
        <button type="button" onClick={enviar} disabled={pendiente || !texto.trim()}>
          {pendiente ? "Anotando" : "Anotar"}
        </button>
      </div>
      {error && <p className="strip-detail">{error}</p>}
    </div>
  );
}
