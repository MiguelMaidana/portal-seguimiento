import { z } from "zod";

// ============================================================
// Dominio
// ============================================================

export const ESTADOS = [
  "inbox",
  "pendiente",
  "en_curso",
  "esperando",
  "hecha",
  "archivada",
] as const;

export const PRIORIDADES = ["baja", "media", "alta"] as const;

export type Estado = (typeof ESTADOS)[number];
export type Prioridad = (typeof PRIORIDADES)[number];

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  inbox: "Sin clasificar",
  pendiente: "Pendiente",
  en_curso: "En curso",
  esperando: "Esperando a alguien",
  hecha: "Hecha",
  archivada: "Archivada",
};

export const ETIQUETA_MOTIVO: Record<string, string> = {
  vencida: "Vencida",
  vence_hoy: "Vence hoy",
  en_curso: "En curso",
  foco_hoy: "Foco de hoy",
  arrastrada: "Arrastrada de días anteriores",
  esperando: "Esperando respuesta",
  sin_clasificar: "Sin clasificar",
  proxima: "Próxima",
};

export interface Area {
  id: string;
  nombre: string;
  slug: string;
  color: string;
  descripcion: string | null;
  orden: number;
  activa: boolean;
}

export interface Persona {
  id: string;
  nombre: string;
  alias: string[];
  rol: string | null;
}

export interface Tarea {
  id: string;
  titulo: string;
  detalle: string | null;
  area_id: string | null;
  persona_id: string | null;
  estado: Estado;
  prioridad: Prioridad;
  fecha_foco: string | null;
  fecha_limite: string | null;
  origen: string;
  etiquetas: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TareaExpandida extends Tarea {
  area: string | null;
  area_color: string | null;
  persona: string | null;
}

export interface LineaBrief {
  id: string;
  titulo: string;
  detalle: string | null;
  estado: Estado;
  prioridad: Prioridad;
  fecha_foco: string | null;
  fecha_limite: string | null;
  area: string | null;
  area_color: string | null;
  persona: string | null;
  motivo: string;
  rango: number;
}

// ============================================================
// Esquemas de entrada (compartidos por el MCP y la web)
// ============================================================

/**
 * Fechas en lenguaje natural. El MCP recibe lo que decís vos, no un ISO.
 */
export const fechaFlexible = z
  .string()
  .describe(
    "Fecha en ISO (2026-09-15) o en lenguaje natural: hoy, mañana, lunes, en 3 dias, proxima semana.",
  );

export const agregarTareaSchema = z.object({
  titulo: z.string().min(1).describe("Qué hay que hacer, en una línea."),
  area: z
    .string()
    .optional()
    .describe(
      "Nombre del área o campo del tablero. Se resuelve por aproximación, no hace falta que sea exacto.",
    ),
  persona: z
    .string()
    .optional()
    .describe(
      "Persona involucrada, si la tarea es hablarle o esperar algo de alguien.",
    ),
  detalle: z.string().optional().describe("Contexto adicional."),
  prioridad: z.enum(PRIORIDADES).optional(),
  estado: z.enum(ESTADOS).optional().describe("Por defecto queda en inbox."),
  fecha_foco: fechaFlexible.optional().describe("Cuándo pensás trabajarla."),
  fecha_limite: fechaFlexible
    .optional()
    .describe("Compromiso real con un tercero."),
  etiquetas: z.array(z.string()).optional(),
});

export const actualizarTareaSchema = z.object({
  tarea: z
    .string()
    .describe(
      "El id de la tarea, o parte de su título. Si hay varias coincidencias se devuelven para desambiguar.",
    ),
  titulo: z.string().optional(),
  detalle: z.string().optional(),
  area: z.string().optional(),
  persona: z.string().optional(),
  estado: z.enum(ESTADOS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  fecha_foco: fechaFlexible.optional(),
  fecha_limite: fechaFlexible.optional(),
});

export const buscarTareasSchema = z.object({
  texto: z.string().optional().describe("Busca en título y detalle."),
  area: z.string().optional(),
  persona: z.string().optional(),
  estado: z.array(z.enum(ESTADOS)).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  vencidas: z.boolean().optional().describe("Solo tareas pasadas de fecha límite."),
  limite: z.number().int().min(1).max(100).optional().default(25),
});

export type AgregarTareaInput = z.infer<typeof agregarTareaSchema>;
export type ActualizarTareaInput = z.infer<typeof actualizarTareaSchema>;
export type BuscarTareasInput = z.infer<typeof buscarTareasSchema>;

// ============================================================
// Normalización y resolución de nombres
// ============================================================

/** Baja a minúsculas y saca acentos, para comparar "Implementacion" con "implementación". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Distancia de Levenshtein, para tolerar tipeos al resolver áreas y personas.
 */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(
        actual[j - 1] + 1,
        previa[j] + 1,
        previa[j - 1] + costo,
      );
    }
    previa = actual;
  }

  return previa[b.length];
}

/**
 * Resuelve un nombre suelto contra una lista de candidatos.
 * Prueba, en orden: igualdad exacta, prefijo, subcadena y por último
 * cercanía tipográfica. Devuelve null si nada supera el umbral, para que
 * el MCP prefiera preguntar antes que inventar un área.
 */
export function resolverNombre<T>(
  consulta: string,
  candidatos: T[],
  claves: (item: T) => string[],
): T | null {
  const q = normalizar(consulta);
  if (!q) return null;

  let mejor: { item: T; puntaje: number } | null = null;

  for (const item of candidatos) {
    for (const clave of claves(item)) {
      const k = normalizar(clave);
      if (!k) continue;

      let puntaje: number;
      if (k === q) puntaje = 100;
      else if (k.startsWith(q) || q.startsWith(k)) puntaje = 85;
      else if (k.includes(q) || q.includes(k)) puntaje = 70;
      else {
        const d = distancia(q, k);
        const maxLargo = Math.max(q.length, k.length);
        const similitud = 1 - d / maxLargo;
        puntaje = similitud >= 0.72 ? Math.round(similitud * 65) : 0;
      }

      if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) {
        mejor = { item, puntaje };
      }
    }
  }

  return mejor ? mejor.item : null;
}

// ============================================================
// Fechas en lenguaje natural
// ============================================================

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function aISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/**
 * Convierte expresiones como "mañana", "el lunes" o "en 3 dias" a una fecha ISO.
 * `hoy` se inyecta para poder testear y para respetar la zona horaria del portal.
 */
export function interpretarFecha(
  entrada: string | null | undefined,
  hoy: Date = new Date(),
): string | null {
  if (!entrada) return null;

  const t = normalizar(entrada);
  if (!t || t === "ninguna" || t === "sin fecha" || t === "null") return null;

  // Ya viene en ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const sumar = (dias: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + dias);
    return aISO(d);
  };

  if (t === "hoy") return aISO(base);
  if (t === "manana" || t === "mañana") return sumar(1);
  if (t === "pasado manana") return sumar(2);
  if (t === "ayer") return sumar(-1);

  // "en 3 dias", "en 2 semanas"
  const relativo = t.match(/^en (\d+) (dia|dias|semana|semanas|mes|meses)$/);
  if (relativo) {
    const n = parseInt(relativo[1], 10);
    const unidad = relativo[2];
    if (unidad.startsWith("dia")) return sumar(n);
    if (unidad.startsWith("semana")) return sumar(n * 7);
    const d = new Date(base);
    d.setMonth(d.getMonth() + n);
    return aISO(d);
  }

  if (t === "proxima semana" || t === "la semana que viene") return sumar(7);
  if (t === "fin de mes") {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return aISO(d);
  }

  // "lunes", "el lunes", "proximo viernes"
  const dia = t.replace(/^(el |proximo |proxima |este |esta )+/, "");
  if (dia in DIAS_SEMANA) {
    const objetivo = DIAS_SEMANA[dia];
    let delta = (objetivo - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "el lunes" dicho un lunes es el que viene
    return sumar(delta);
  }

  // No se pudo interpretar: mejor null que una fecha inventada.
  return null;
}

/** Días de diferencia respecto de hoy. Negativo = pasado. */
export function diasDesdeHoy(iso: string | null, hoy: Date = new Date()): number | null {
  if (!iso) return null;
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const [y, m, d] = iso.split("-").map(Number);
  const objetivo = new Date(y, m - 1, d);
  return Math.round((objetivo.getTime() - base.getTime()) / 86_400_000);
}

export function fechaRelativaLegible(
  iso: string | null,
  hoy: Date = new Date(),
): string | null {
  const d = diasDesdeHoy(iso, hoy);
  if (d === null) return null;
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  if (d < 0) return `hace ${Math.abs(d)} días`;
  if (d < 7) return `en ${d} días`;
  return iso;
}
