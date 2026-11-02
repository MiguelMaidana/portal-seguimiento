import { ETIQUETA_ESTADO, fechaRelativaLegible } from "@tablero/core";
import { listarNotas, obtenerTarea } from "@tablero/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "../../../components/Nav";
import { NotaForm } from "../../../components/NotaForm";
import { requireUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Ficha de una tarea: los datos arriba y la bitácora de notas abajo,
 * más recientes primero. Las notas se acumulan, nunca se pisan.
 */
export default async function FichaTarea({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const tarea = await obtenerTarea(id);
  if (!tarea) notFound();
  const notas = await listarNotas(tarea.id);

  const datos: [string, string | null][] = [
    ["Estado", ETIQUETA_ESTADO[tarea.estado]],
    ["Prioridad", tarea.prioridad],
    ["Área", tarea.area ?? "sin asignar"],
    ["Persona", tarea.persona],
    ["Foco", tarea.fecha_foco ? fechaRelativaLegible(tarea.fecha_foco) : null],
    [
      "Límite",
      tarea.fecha_limite ? fechaRelativaLegible(tarea.fecha_limite) : null,
    ],
  ];

  return (
    <>
      <header className="board-head">
        <h1 className="board-title">{tarea.titulo}</h1>
        <p className="board-date narrow">
          <Link href="/tareas">← Tareas</Link>
        </p>
        <Nav activa="tareas" />
      </header>

      <section className="ficha">
        <dl className="ficha-datos narrow">
          {datos
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        {tarea.detalle && <p className="ficha-detalle">{tarea.detalle}</p>}
      </section>

      <section className="rail">
        <h2 className="rail-label">
          Notas
          <span className="rail-count narrow">{notas.length}</span>
        </h2>

        <NotaForm tareaId={tarea.id} />

        {notas.length === 0 ? (
          <div className="empty">
            <p>Todavía no hay notas. La primera puede ser lo último que pasó.</p>
          </div>
        ) : (
          <ol className="notas">
            {notas.map((n) => (
              <li key={n.id} className="nota">
                <span className="nota-fecha narrow">
                  {fechaHora(n.created_at)}
                  {n.actor === "chat" ? " · desde el chat" : ""}
                </span>
                <p className="nota-texto">{n.texto}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
