import {
  type ActualizarTareaInput,
  type AgregarTareaInput,
  type Area,
  type BuscarTareasInput,
  type LineaBrief,
  type Persona,
  type TareaExpandida,
  interpretarFecha,
  resolverNombre,
} from "@tablero/core";
import { db, hoyLocal, isoLocal } from "./client";

const CAMPOS_EXPANDIDOS = `
  id, titulo, detalle, area_id, persona_id, estado, prioridad,
  fecha_foco, fecha_limite, origen, etiquetas,
  created_at, updated_at, completed_at,
  areas ( nombre, color ),
  personas ( nombre )
`;

/**
 * Relación embebida de PostgREST. Sin tipos generados de la base, el cliente
 * infiere los embeds como array aunque en una relación muchos-a-uno lleguen
 * como objeto, así que aceptamos las dos formas y normalizamos.
 */
type Embed<T> = T | T[] | null | undefined;

type FilaCruda = Record<string, unknown> & {
  areas?: Embed<{ nombre?: string | null; color?: string | null }>;
  personas?: Embed<{ nombre?: string | null }>;
};

function uno<T>(valor: Embed<T>): T | null {
  if (!valor) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

function expandir(fila: FilaCruda): TareaExpandida {
  const { areas, personas, ...resto } = fila;
  const area = uno(areas);
  const persona = uno(personas);

  return {
    ...(resto as unknown as TareaExpandida),
    area: area?.nombre ?? null,
    area_color: area?.color ?? null,
    persona: persona?.nombre ?? null,
  };
}

// ============================================================
// Catálogos
// ============================================================

export async function listarAreas(): Promise<Area[]> {
  const { data, error } = await db()
    .from("areas")
    .select("*")
    .eq("activa", true)
    .order("orden");

  if (error) throw new Error(`No se pudieron leer las áreas: ${error.message}`);
  return (data ?? []) as Area[];
}

export async function listarPersonas(): Promise<Persona[]> {
  const { data, error } = await db()
    .from("personas")
    .select("*")
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer las personas: ${error.message}`);
  return (data ?? []) as Persona[];
}

/**
 * Resuelve un área por nombre aproximado. Si no encuentra nada, devuelve null
 * en lugar de crear un área nueva: es mejor preguntar que ensuciar el tablero
 * con "Implementacion" e "Implementación" como dos campos distintos.
 */
async function resolverArea(nombre?: string): Promise<Area | null> {
  if (!nombre) return null;
  const areas = await listarAreas();
  return resolverNombre(nombre, areas, (a) => [a.nombre, a.slug]);
}

/**
 * Resuelve una persona por nombre o alias. A diferencia de las áreas, si no
 * existe la damos de alta: la lista de gente es abierta por naturaleza y
 * "hablarle a Roger" no debería fallar porque Roger todavía no está cargado.
 */
async function resolverPersona(nombre?: string): Promise<Persona | null> {
  if (!nombre) return null;

  const personas = await listarPersonas();
  const encontrada = resolverNombre(nombre, personas, (p) => [
    p.nombre,
    ...p.alias,
  ]);
  if (encontrada) return encontrada;

  const limpio = nombre.trim();
  const { data, error } = await db()
    .from("personas")
    .insert({ nombre: limpio })
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo crear la persona: ${error.message}`);
  return data as Persona;
}

// ============================================================
// Brief del día
// ============================================================

export interface Brief {
  fecha: string;
  lineas: LineaBrief[];
  grupos: Record<string, LineaBrief[]>;
  conteos: {
    vencidas: number;
    vence_hoy: number;
    en_curso: number;
    foco_hoy: number;
    arrastradas: number;
    esperando: number;
    sin_clasificar: number;
    total: number;
  };
}

export async function obtenerBrief(): Promise<Brief> {
  const { data, error } = await db()
    .from("v_brief")
    .select("*")
    .order("rango")
    .order("prioridad", { ascending: false })
    .order("fecha_limite", { nullsFirst: false });

  if (error) throw new Error(`No se pudo armar el brief: ${error.message}`);

  const lineas = (data ?? []) as LineaBrief[];
  const grupos: Record<string, LineaBrief[]> = {};
  for (const linea of lineas) {
    (grupos[linea.motivo] ??= []).push(linea);
  }

  const contar = (motivo: string) => grupos[motivo]?.length ?? 0;

  return {
    fecha: isoLocal(),
    lineas,
    grupos,
    conteos: {
      vencidas: contar("vencida"),
      vence_hoy: contar("vence_hoy"),
      en_curso: contar("en_curso"),
      foco_hoy: contar("foco_hoy"),
      arrastradas: contar("arrastrada"),
      esperando: contar("esperando"),
      sin_clasificar: contar("sin_clasificar"),
      total: lineas.length,
    },
  };
}

// ============================================================
// Alta
// ============================================================

export async function agregarTarea(
  entrada: AgregarTareaInput,
  actor: "web" | "chat" = "web",
): Promise<TareaExpandida> {
  const hoy = hoyLocal();
  const area = await resolverArea(entrada.area);
  const persona = await resolverPersona(entrada.persona);

  // Si la tarea es esperar algo de alguien, el estado natural es 'esperando'.
  const estado =
    entrada.estado ?? (persona && !entrada.area ? "pendiente" : "inbox");

  const { data, error } = await db()
    .from("tareas")
    .insert({
      titulo: entrada.titulo.trim(),
      detalle: entrada.detalle ?? null,
      area_id: area?.id ?? null,
      persona_id: persona?.id ?? null,
      estado,
      prioridad: entrada.prioridad ?? "media",
      fecha_foco: interpretarFecha(entrada.fecha_foco, hoy),
      fecha_limite: interpretarFecha(entrada.fecha_limite, hoy),
      etiquetas: entrada.etiquetas ?? [],
      origen: actor,
    })
    .select(CAMPOS_EXPANDIDOS)
    .single();

  if (error) throw new Error(`No se pudo crear la tarea: ${error.message}`);

  const tarea = expandir(data as unknown as FilaCruda);

  await db().from("eventos").insert({
    tarea_id: tarea.id,
    tipo: "creada",
    actor,
    payload: { titulo: tarea.titulo, area: tarea.area },
  });

  return tarea;
}

// ============================================================
// Búsqueda y desambiguación
// ============================================================

export async function buscarTareas(
  filtros: BuscarTareasInput,
): Promise<TareaExpandida[]> {
  let q = db().from("tareas").select(CAMPOS_EXPANDIDOS);

  if (filtros.texto) {
    const patron = `%${filtros.texto}%`;
    q = q.or(`titulo.ilike.${patron},detalle.ilike.${patron}`);
  }

  if (filtros.estado?.length) {
    q = q.in("estado", filtros.estado);
  } else {
    q = q.not("estado", "in", "(hecha,archivada)");
  }

  if (filtros.prioridad) q = q.eq("prioridad", filtros.prioridad);

  if (filtros.area) {
    const area = await resolverArea(filtros.area);
    if (!area) return [];
    q = q.eq("area_id", area.id);
  }

  if (filtros.persona) {
    const personas = await listarPersonas();
    const persona = resolverNombre(filtros.persona, personas, (p) => [
      p.nombre,
      ...p.alias,
    ]);
    if (!persona) return [];
    q = q.eq("persona_id", persona.id);
  }

  if (filtros.vencidas) {
    q = q.lt("fecha_limite", isoLocal());
  }

  const { data, error } = await q
    .order("fecha_limite", { nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(filtros.limite ?? 25);

  if (error) throw new Error(`Falló la búsqueda: ${error.message}`);
  return (data ?? []).map((f) => expandir(f as unknown as FilaCruda));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Resolucion =
  | { tipo: "una"; tarea: TareaExpandida }
  | { tipo: "varias"; candidatas: TareaExpandida[] }
  | { tipo: "ninguna" };

/**
 * Encuentra una tarea a partir de un id o de parte del título.
 * Si hay ambigüedad devuelve las candidatas para que el chat pregunte,
 * en vez de actualizar la tarea equivocada.
 */
export async function resolverTarea(referencia: string): Promise<Resolucion> {
  const ref = referencia.trim();

  if (UUID.test(ref)) {
    const { data } = await db()
      .from("tareas")
      .select(CAMPOS_EXPANDIDOS)
      .eq("id", ref)
      .maybeSingle();
    return data
      ? { tipo: "una", tarea: expandir(data as unknown as FilaCruda) }
      : { tipo: "ninguna" };
  }

  const candidatas = await buscarTareas({ texto: ref, limite: 10 });

  if (candidatas.length === 0) return { tipo: "ninguna" };
  if (candidatas.length === 1) return { tipo: "una", tarea: candidatas[0] };

  // Coincidencia exacta de título gana sobre las parciales.
  const exacta = candidatas.filter(
    (t) => t.titulo.toLowerCase() === ref.toLowerCase(),
  );
  if (exacta.length === 1) return { tipo: "una", tarea: exacta[0] };

  return { tipo: "varias", candidatas };
}

// ============================================================
// Actualización
// ============================================================

export async function actualizarTarea(
  entrada: ActualizarTareaInput,
  actor: "web" | "chat" = "web",
): Promise<Resolucion> {
  const resuelta = await resolverTarea(entrada.tarea);
  if (resuelta.tipo !== "una") return resuelta;

  const hoy = hoyLocal();
  const parche: Record<string, unknown> = {};

  if (entrada.titulo !== undefined) parche.titulo = entrada.titulo.trim();
  if (entrada.detalle !== undefined) parche.detalle = entrada.detalle;
  if (entrada.estado !== undefined) parche.estado = entrada.estado;
  if (entrada.prioridad !== undefined) parche.prioridad = entrada.prioridad;

  if (entrada.fecha_foco !== undefined) {
    parche.fecha_foco = interpretarFecha(entrada.fecha_foco, hoy);
  }
  if (entrada.fecha_limite !== undefined) {
    parche.fecha_limite = interpretarFecha(entrada.fecha_limite, hoy);
  }

  if (entrada.area !== undefined) {
    const area = await resolverArea(entrada.area);
    if (!area) {
      throw new Error(
        `No encontré un área parecida a "${entrada.area}". Las áreas actuales son: ${(
          await listarAreas()
        )
          .map((a) => a.nombre)
          .join(", ")}.`,
      );
    }
    parche.area_id = area.id;
  }

  if (entrada.persona !== undefined) {
    const persona = await resolverPersona(entrada.persona);
    parche.persona_id = persona?.id ?? null;
  }

  if (Object.keys(parche).length === 0) {
    return { tipo: "una", tarea: resuelta.tarea };
  }

  const { data, error } = await db()
    .from("tareas")
    .update(parche)
    .eq("id", resuelta.tarea.id)
    .select(CAMPOS_EXPANDIDOS)
    .single();

  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);

  await db().from("eventos").insert({
    tarea_id: resuelta.tarea.id,
    tipo: parche.estado === "hecha" ? "completada" : "actualizada",
    actor,
    payload: parche,
  });

  return { tipo: "una", tarea: expandir(data as unknown as FilaCruda) };
}

export async function completarTarea(
  referencia: string,
  actor: "web" | "chat" = "web",
): Promise<Resolucion> {
  return actualizarTarea({ tarea: referencia, estado: "hecha" }, actor);
}

// ============================================================
// Métricas
// ============================================================

export interface Metricas {
  abiertas_por_area: { area: string; cantidad: number }[];
  abiertas_por_estado: { estado: string; cantidad: number }[];
  completadas_ultimos_7: number;
  completadas_ultimos_30: number;
  creadas_ultimos_7: number;
  vencidas: number;
  sin_clasificar: number;
  esperando_por_persona: { persona: string; cantidad: number }[];
  edad_promedio_dias: number | null;
  serie_completadas: { fecha: string; cantidad: number }[];
}

export async function obtenerMetricas(): Promise<Metricas> {
  const hoy = hoyLocal();
  const iso = isoLocal;
  const hace = (dias: number) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - dias);
    return d;
  };

  const { data: abiertas, error: e1 } = await db()
    .from("tareas")
    .select("estado, created_at, fecha_limite, areas ( nombre ), personas ( nombre )")
    .not("estado", "in", "(hecha,archivada)");

  if (e1) throw new Error(`No se pudieron leer las métricas: ${e1.message}`);

  const { data: completadas, error: e2 } = await db()
    .from("tareas")
    .select("completed_at")
    .eq("estado", "hecha")
    .gte("completed_at", hace(30).toISOString());

  if (e2) throw new Error(`No se pudieron leer las completadas: ${e2.message}`);

  const { count: creadas7 } = await db()
    .from("tareas")
    .select("id", { count: "exact", head: true })
    .gte("created_at", hace(7).toISOString());

  const filas = (abiertas ?? []) as unknown as FilaCruda[];
  const porArea = new Map<string, number>();
  const porEstado = new Map<string, number>();
  const porPersona = new Map<string, number>();
  let vencidas = 0;
  let sumaEdad = 0;

  for (const f of filas) {
    const area = uno(f.areas)?.nombre ?? "Sin área";
    porArea.set(area, (porArea.get(area) ?? 0) + 1);

    const estado = String(f.estado);
    porEstado.set(estado, (porEstado.get(estado) ?? 0) + 1);

    const nombrePersona = uno(f.personas)?.nombre;
    if (estado === "esperando" && nombrePersona) {
      porPersona.set(nombrePersona, (porPersona.get(nombrePersona) ?? 0) + 1);
    }

    const limite = f.fecha_limite as string | null;
    if (limite && limite < iso(hoy)) vencidas++;

    const creada = new Date(String(f.created_at));
    sumaEdad += (hoy.getTime() - creada.getTime()) / 86_400_000;
  }

  const hechas = (completadas ?? []) as { completed_at: string }[];
  const limite7 = hace(7).getTime();
  const serie = new Map<string, number>();
  for (let i = 13; i >= 0; i--) serie.set(iso(hace(i)), 0);

  let completadas7 = 0;
  for (const h of hechas) {
    const t = new Date(h.completed_at);
    if (t.getTime() >= limite7) completadas7++;
    const dia = h.completed_at.slice(0, 10);
    if (serie.has(dia)) serie.set(dia, (serie.get(dia) ?? 0) + 1);
  }

  const ordenar = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]);

  return {
    abiertas_por_area: ordenar(porArea).map(([area, cantidad]) => ({ area, cantidad })),
    abiertas_por_estado: ordenar(porEstado).map(([estado, cantidad]) => ({
      estado,
      cantidad,
    })),
    completadas_ultimos_7: completadas7,
    completadas_ultimos_30: hechas.length,
    creadas_ultimos_7: creadas7 ?? 0,
    vencidas,
    sin_clasificar: porEstado.get("inbox") ?? 0,
    esperando_por_persona: ordenar(porPersona).map(([persona, cantidad]) => ({
      persona,
      cantidad,
    })),
    edad_promedio_dias: filas.length
      ? Math.round((sumaEdad / filas.length) * 10) / 10
      : null,
    serie_completadas: [...serie.entries()].map(([fecha, cantidad]) => ({
      fecha,
      cantidad,
    })),
  };
}
