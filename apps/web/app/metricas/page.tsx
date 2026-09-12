import { ETIQUETA_ESTADO } from "@tablero/core";
import { obtenerMetricas } from "@tablero/db";
import { AutoRefresh } from "../../components/AutoRefresh";
import { Nav } from "../../components/Nav";
import { requireUser } from "../../lib/auth";
import { VistaMetricas } from "./VistaMetricas";

export const dynamic = "force-dynamic";

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
        <Nav activa="metricas" />
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

      <VistaMetricas
        breakdowns={[
          {
            titulo: "Abiertas por área",
            datos: m.abiertas_por_area.map((a) => ({
              etiqueta: a.area,
              cantidad: a.cantidad,
            })),
          },
          {
            titulo: "Abiertas por estado",
            datos: m.abiertas_por_estado.map((e) => ({
              etiqueta: ETIQUETA_ESTADO[e.estado as never] ?? e.estado,
              cantidad: e.cantidad,
            })),
          },
          {
            titulo: "Esperando respuesta de",
            datos: m.esperando_por_persona.map((p) => ({
              etiqueta: p.persona,
              cantidad: p.cantidad,
            })),
          },
        ]}
      />
    </>
  );
}
