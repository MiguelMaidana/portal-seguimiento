"use client";

import { useState, useTransition } from "react";
import {
  type LineaBrief,
  diasDesdeHoy,
  fechaRelativaLegible,
} from "@tablero/core";
import { marcarHecha } from "../app/actions";

const COLOR_AREA: Record<string, string> = {
  teal: "var(--area-teal)",
  ochre: "var(--area-ochre)",
  plum: "var(--area-plum)",
  slate: "var(--area-slate)",
  moss: "var(--area-moss)",
  grey: "var(--area-grey)",
};

export function Strip({ tarea }: { tarea: LineaBrief }) {
  const [pendiente, iniciar] = useTransition();
  const [saliendo, setSaliendo] = useState(false);

  const acento = COLOR_AREA[tarea.area_color ?? "grey"] ?? COLOR_AREA.grey;
  const dias = diasDesdeHoy(tarea.fecha_limite);
  const atrasada = dias !== null && dias < 0;

  function completar() {
    setSaliendo(true);
    iniciar(async () => {
      const r = await marcarHecha(tarea.id);
      if (!r.ok) setSaliendo(false);
    });
  }

  const clases = [
    "strip",
    tarea.prioridad === "alta" ? "strip-high" : "",
    saliendo ? "strip-leaving" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={clases} style={{ ["--strip-accent" as string]: acento }}>
      <button
        type="button"
        className="strip-done"
        onClick={completar}
        disabled={pendiente || saliendo}
        aria-label={`Marcar como hecha: ${tarea.titulo}`}
      />

      <div className="strip-body">
        <span className="strip-title">{tarea.titulo}</span>

        <div className="strip-meta narrow">
          {tarea.area && <span className="strip-area">{tarea.area}</span>}

          {tarea.persona && (
            <span className={tarea.estado === "esperando" ? "strip-hold" : ""}>
              {tarea.estado === "esperando"
                ? `esperando a ${tarea.persona}`
                : tarea.persona}
            </span>
          )}

          {tarea.fecha_limite && (
            <span className={atrasada ? "strip-late" : ""}>
              {atrasada
                ? `venció ${fechaRelativaLegible(tarea.fecha_limite)}`
                : `vence ${fechaRelativaLegible(tarea.fecha_limite)}`}
            </span>
          )}

          {tarea.prioridad === "alta" && (
            <span className="badge-priority">prioridad alta</span>
          )}
        </div>

        {tarea.detalle && <p className="strip-detail">{tarea.detalle}</p>}
      </div>
    </div>
  );
}
