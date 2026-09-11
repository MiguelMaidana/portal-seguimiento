import { ESTADOS, type Estado } from "@tablero/core";
import { buscarTareas, listarAreas } from "@tablero/db";
import Link from "next/link";
import { AutoRefresh } from "../../components/AutoRefresh";
import { Strip } from "../../components/Strip";
import { logout } from "../auth-actions";
import { requireUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Vista completa por estado, separada de "Hoy": esa sigue mostrando solo
 * lo accionable hoy, esta muestra todo lo que hay, sin filtro de fecha.
 */
const PESTANAS: { clave: string; etiqueta: string; estados: Estado[] }[] = [
  { clave: "pendiente", etiqueta: "Pendientes", estados: ["pendiente"] },
  { clave: "en_curso", etiqueta: "En curso", estados: ["en_curso"] },
  { clave: "esperando", etiqueta: "Bloqueadas", estados: ["esperando"] },
  { clave: "hecha", etiqueta: "Completadas", estados: ["hecha"] },
  { clave: "archivada", etiqueta: "Canceladas", estados: ["archivada"] },
  { clave: "inbox", etiqueta: "Sin clasificar", estados: ["inbox"] },
  { clave: "todas", etiqueta: "Todas", estados: [...ESTADOS] },
];

// Secciones de la vista "por vertical": mismos estados que las pestañas,
// menos "todas" (no tiene sentido como sección propia).
const SECCIONES = PESTANAS.filter((p) => p.clave !== "todas");

function Nav({ activa }: { activa: "hoy" | "tareas" | "metricas" }) {
  return (
    <nav className="board-nav narrow">
      <Link href="/" aria-current={activa === "hoy" ? "page" : undefined}>
        Hoy
      </Link>
      <Link href="/tareas" aria-current={activa === "tareas" ? "page" : undefined}>
        Tareas
      </Link>
      <Link href="/metricas" aria-current={activa === "metricas" ? "page" : undefined}>
        Métricas
      </Link>
      <form action={logout}>
        <button type="submit">Salir</button>
      </form>
    </nav>
  );
}

export default async function Tareas({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; vista?: string; area?: string }>;
}) {
  await requireUser();
  const { estado, vista, area } = await searchParams;
  const modoVertical = vista === "vertical";

  if (modoVertical) {
    const areas = await listarAreas();
    const areaActiva = areas.find((a) => a.slug === area) ?? areas[0] ?? null;

    const tareasPorSeccion = areaActiva
      ? await Promise.all(
          SECCIONES.map((s) =>
            buscarTareas({
              area: areaActiva.nombre,
              estado: s.estados,
              limite: 100,
            }),
          ),
        )
      : [];

    return (
      <>
        <AutoRefresh />
        <header className="board-head">
          <h1 className="board-title">Tareas</h1>
          <p className="board-date narrow">
            {areaActiva ? areaActiva.nombre : "Por vertical"}
          </p>
          <Nav activa="tareas" />
        </header>

        <div className="toggle-vista">
          <Link href="/tareas" className="toggle-vista-btn">
            Por estado
          </Link>
          <Link
            href="/tareas?vista=vertical"
            className="toggle-vista-btn toggle-vista-activo"
          >
            Por vertical
          </Link>
        </div>

        {areas.length === 0 ? (
          <div className="empty">
            <p>No hay áreas cargadas todavía.</p>
          </div>
        ) : (
          <>
            <div className="tabs" role="tablist">
              {areas.map((a) => (
                <Link
                  key={a.id}
                  href={`/tareas?vista=vertical&area=${a.slug}`}
                  className={`tab${areaActiva?.id === a.id ? " tab-activa" : ""}`}
                  aria-current={areaActiva?.id === a.id ? "page" : undefined}
                >
                  {a.nombre}
                </Link>
              ))}
            </div>

            {SECCIONES.map((s, i) => {
              const tareas = tareasPorSeccion[i];
              if (!tareas || tareas.length === 0) return null;
              return (
                <section key={s.clave} className="rail">
                  <h2 className="rail-label">
                    {s.etiqueta}
                    <span className="rail-count narrow">{tareas.length}</span>
                  </h2>
                  <div className="rail-slots">
                    {tareas.map((t) => (
                      <Strip key={t.id} tarea={t} />
                    ))}
                  </div>
                </section>
              );
            })}

            {tareasPorSeccion.every((t) => t.length === 0) && (
              <div className="empty">
                <p>
                  No hay tareas cargadas en &ldquo;{areaActiva?.nombre}&rdquo;.
                </p>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  const activa = PESTANAS.find((p) => p.clave === estado) ?? PESTANAS[0];
  const tareas = await buscarTareas({ estado: activa.estados, limite: 100 });

  return (
    <>
      <AutoRefresh />
      <header className="board-head">
        <h1 className="board-title">Tareas</h1>
        <p className="board-date narrow">{activa.etiqueta}</p>
        <Nav activa="tareas" />
      </header>

      <div className="toggle-vista">
        <Link
          href="/tareas"
          className="toggle-vista-btn toggle-vista-activo"
        >
          Por estado
        </Link>
        <Link href="/tareas?vista=vertical" className="toggle-vista-btn">
          Por vertical
        </Link>
      </div>

      <div className="tabs" role="tablist">
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={`/tareas?estado=${p.clave}`}
            className={`tab${p.clave === activa.clave ? " tab-activa" : ""}`}
            aria-current={p.clave === activa.clave ? "page" : undefined}
          >
            {p.etiqueta}
          </Link>
        ))}
      </div>

      {tareas.length === 0 ? (
        <div className="empty">
          <p>No hay tareas en &ldquo;{activa.etiqueta}&rdquo;.</p>
        </div>
      ) : (
        <div className="rail-slots">
          {tareas.map((t) => (
            <Strip key={t.id} tarea={t} />
          ))}
        </div>
      )}
    </>
  );
}
