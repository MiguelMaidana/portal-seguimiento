"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Mismo orden que PALETA en Barras.tsx, valores hex para Recharts SVG
// CSS vars: --area-teal, --area-ochre, --area-plum, --area-slate, --area-moss, --area-grey
const PALETA_HEX = [
  "#0f6e74",
  "#a66a15",
  "#7a3b67",
  "#45608a",
  "#4f7a3a",
  "#64707d",
];

export function TortaBreakdown({
  titulo,
  datos,
}: {
  titulo: string;
  datos: { etiqueta: string; cantidad: number }[];
}) {
  if (datos.length === 0) return null;

  return (
    <section className="breakdown">
      <h2>{titulo}</h2>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={datos}
            dataKey="cantidad"
            nameKey="etiqueta"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label
          >
            {datos.map((_, i) => (
              <Cell key={i} fill={PALETA_HEX[i % PALETA_HEX.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </section>
  );
}