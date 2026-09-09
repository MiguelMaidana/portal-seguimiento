import { ETIQUETA_ESTADO } from "@tablero/core";
import { obtenerMetricas } from "@tablero/db";
import Link from "next/link";
import { AutoRefresh } from "../../components/AutoRefresh";
import { logout } from "../auth-actions";
import { requireUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

const PALETA = [
  "var(--area-teal)",
  "var(--area-ochre)",
  "var(--area-plum)",
  "var(--area-slate)",
  "var(--area-moss)",
  "var(--area-grey)",
];

function Barras({
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

export default async function Metricas() {
  await requireUser();
  const m = await obtenerMetricas();
  const maxSerie = Math.max(...m.serie_completadas.map((d) => d.cantidad), 1);

  return (
    <>
      <AutoRefresh />
      <header className="board-head">
        <h1 className="board-title">Métricas</h1>
        <p className="board-date narrow">Últimos 30 días</p>
        <nav className="board-nav narrow">
          <Link href="/">Hoy</Link>
          <Link href="/metricas" aria-current="page">
            Métricas
          </Link>
          <form action={logout}>
            <button type="submit">Salir</button>
          </form>
        </nav>
      </header>

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-value">{m.completadas_ultimos_7}</span>
          <span className="metric-label">cerradas en 7 días</span>
        </div>
        <div className="metric">
          <span className="metric-value">{m.creadas_ultimos_7}</span>
          <span className="metric-label">nuevas en 7 días</span>
        </div>
        <div className={`metric ${m.vencidas > 0 ? "metric-signal" : ""}`}>
          <span className="metric-value">{m.vencidas}</span>
          <span className="metric-label">vencidas</span>
        </div>
        <div className="metric">
          <span className="metric-value">{m.sin_clasificar}</span>
          <span className="metric-label">sin clasificar</span>
        </div>
        <div className="metric">
          <span className="metric-value">{m.edad_promedio_dias ?? "—"}</span>
          <span className="metric-label">días de antigüedad promedio</span>
        </div>
      </div>

      <section className="breakdown">
        <h2>Cierres por día</h2>
        <ul className="spark">
          {m.serie_completadas.map((d) => (
            <li
              key={d.fecha}
              data-zero={d.cantidad === 0}
              style={{ height: `${(d.cantidad / maxSerie) * 100}%` }}
              title={`${d.fecha}: ${d.cantidad}`}
            />
          ))}
        </ul>
      </section>

      <Barras
        titulo="Abiertas por área"
        filas={m.abiertas_por_area.map((a) => ({
          etiqueta: a.area,
          cantidad: a.cantidad,
        }))}
      />

      <Barras
        titulo="Abiertas por estado"
        filas={m.abiertas_por_estado.map((e) => ({
          etiqueta: ETIQUETA_ESTADO[e.estado as never] ?? e.estado,
          cantidad: e.cantidad,
        }))}
      />

      <Barras
        titulo="Esperando respuesta de"
        filas={m.esperando_por_persona.map((p) => ({
          etiqueta: p.persona,
          cantidad: p.cantidad,
        }))}
      />
    </>
  );
}
