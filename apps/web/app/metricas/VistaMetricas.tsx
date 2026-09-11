"use client";

import { useState } from "react";
import { ToggleVista } from "../../components/ToggleVista";
import { SeccionBreakdown } from "./SeccionBreakdown";

type BreakdownDatos = {
  titulo: string;
  datos: { etiqueta: string; cantidad: number }[];
};

export function VistaMetricas({
  breakdowns,
}: {
  breakdowns: BreakdownDatos[];
}) {
  const [modo, setModo] = useState<"barras" | "tortas">("barras");

  return (
    <>
      <ToggleVista modo={modo} onChange={setModo} />
      {breakdowns.map((b, i) => (
        <SeccionBreakdown
          key={i}
          modo={modo}
          titulo={b.titulo}
          datos={b.datos}
        />
      ))}
    </>
  );
}