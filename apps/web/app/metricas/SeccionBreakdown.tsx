"use client";

import { Barras } from "./Barras";
import { TortaBreakdown } from "../../components/TortaBreakdown";

export function SeccionBreakdown({
  modo,
  titulo,
  datos,
}: {
  modo: "barras" | "tortas";
  titulo: string;
  datos: { etiqueta: string; cantidad: number }[];
}) {
  return modo === "tortas" ? (
    <TortaBreakdown titulo={titulo} datos={datos} />
  ) : (
    <Barras titulo={titulo} filas={datos} />
  );
}