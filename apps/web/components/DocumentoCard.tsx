"use client";

import { useState, useTransition } from "react";
import type { Documento } from "@tablero/db/documentos";
import { pedirLinkDescarga } from "../app/documentos/actions";

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function BotonDescargar({ documento }: { documento: Documento }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function descargar() {
    setError(null);
    iniciar(async () => {
      const r = await pedirLinkDescarga(documento.id);
      if (r.ok) {
        window.location.href = r.url;
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        className="documento-descargar"
        onClick={descargar}
        disabled={pendiente}
      >
        {pendiente ? "Generando link…" : "Descargar"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export function DocumentoCard({
  nombreLogico,
  ultima,
  anteriores,
}: {
  nombreLogico: string;
  ultima: Documento;
  anteriores: Documento[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="documento-card">
      <div className="documento-card-header">
        <div className="documento-card-info">
          <span className="documento-nombre">{nombreLogico}</span>
          <span className="documento-meta">
            {formatearFecha(ultima.subido_en)} · {formatearTamano(ultima.tamano_bytes)}
          </span>
        </div>
        <BotonDescargar documento={ultima} />
      </div>

      {anteriores.length > 0 && (
        <>
          <button
            type="button"
            className="documento-historial-toggle"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? "Ocultar" : "Ver"} versiones anteriores ({anteriores.length})
          </button>
          {abierto && (
            <ul className="documento-historial">
              {anteriores.map((v) => (
                <li key={v.id}>
                  <span>
                    {formatearFecha(v.subido_en)} · {formatearTamano(v.tamano_bytes)}
                  </span>
                  <BotonDescargar documento={v} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
