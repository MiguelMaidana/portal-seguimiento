import { ESTADOS, type Estado } from "@tablero/core";
import { buscarTareas } from "@tablero/db";
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

export default async function Tareas({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  await requireUser();
  const { estado } = await searchParams;
  const activa = PESTANAS.find((p) => p.clave === estado) ?? PESTANAS[0];

  const tareas = await buscarTareas({ estado: activa.estados, limite: 100 });

  return (
    <>
      <AutoRefresh />
      <header className="board-head">
        <h1 className="board-title">Tareas</h1>
        <p className="board-date narrow">{activa.etiqueta}</p>

        <nav className="board-nav narrow">
          <Link href="/">Hoy</Link>
          <Link href="/tareas" aria-current="page">
            Tareas
          </Link>
          <Link href="/metricas">Métricas</Link>
          <form action={logout}>
            <button type="submit">Salir</button>
          </form>
        </nav>
      </header>

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
