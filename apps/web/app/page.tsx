import { ETIQUETA_MOTIVO } from "@tablero/core";
import { obtenerBrief } from "@tablero/db";
import { AutoRefresh } from "../components/AutoRefresh";
import { Capture } from "../components/Capture";
import { Nav } from "../components/Nav";
import { Strip } from "../components/Strip";
import { requireUser } from "../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Orden de los rieles: primero lo que ya se te fue de las manos,
 * después lo del día, y al final lo que depende de otros.
 */
const RIELES = [
  "vencida",
  "vence_hoy",
  "en_curso",
  "foco_hoy",
  "arrastrada",
  "sin_clasificar",
  "esperando",
  "proxima",
] as const;

function fechaLegible(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

export default async function Tablero() {
  await requireUser();
  const brief = await obtenerBrief();
  const { conteos, grupos } = brief;

  return (
    <>
      <AutoRefresh />
      <header className="board-head">
        <h1 className="board-title">Tablero</h1>
        <p className="board-date narrow">{fechaLegible(brief.fecha)}</p>

        <div className="tallies narrow">
          <span className="tally">
            <b>{conteos.total}</b> abiertas
          </span>
          {conteos.vencidas > 0 && (
            <span className="tally tally-signal">
              <b>{conteos.vencidas}</b> vencidas
            </span>
          )}
          {conteos.sin_clasificar > 0 && (
            <span className="tally">
              <b>{conteos.sin_clasificar}</b> sin clasificar
            </span>
          )}
        </div>

        <Nav activa="hoy" />
      </header>

      <Capture />

      {conteos.total === 0 ? (
        <div className="empty">
          <p>
            No hay nada reclamando atención. Cuando aparezca algo, anotalo arriba
            o pedíselo al chat: se guarda acá igual.
          </p>
        </div>
      ) : (
        RIELES.filter((motivo) => grupos[motivo]?.length).map((motivo) => {
          const tareas = grupos[motivo];
          return (
            <section
              key={motivo}
              className={`rail ${motivo === "vencida" ? "rail-signal" : ""}`}
            >
              <h2 className="rail-label">
                {ETIQUETA_MOTIVO[motivo] ?? motivo}
                <span className="rail-count narrow">{tareas.length}</span>
              </h2>
              <div className="rail-slots">
                {tareas.map((t) => (
                  <Strip key={t.id} tarea={t} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
