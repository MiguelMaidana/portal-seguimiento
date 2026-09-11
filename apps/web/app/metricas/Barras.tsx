"use client";

const PALETA = [
  "var(--area-teal)",
  "var(--area-ochre)",
  "var(--area-plum)",
  "var(--area-slate)",
  "var(--area-moss)",
  "var(--area-grey)",
];

export function Barras({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { etiqueta: string; cantidad: number }[];
}) {
  if (filas.length === 0) return null;
  const max = Math.max(...filas.map((f) => f.cantidad), 1);

  return (
    <section className="breakdown">
      <h2>{titulo}</h2>
      <div className="bars">
        {filas.map((f, i) => (
          <div className="bar-row" key={f.etiqueta}>
            <span className="narrow">{f.etiqueta}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{
                  width: `${(f.cantidad / max) * 100}%`,
                  ["--bar-color" as string]: PALETA[i % PALETA.length],
                }}
              />
            </span>
            <span className="bar-value narrow">{f.cantidad}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
