import { createMcpHandler } from "mcp-handler";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_MOTIVO,
  actualizarTareaSchema,
  agregarTareaSchema,
  buscarTareasSchema,
  fechaRelativaLegible,
  type LineaBrief,
  type TareaExpandida,
} from "@tablero/core";
import {
  actualizarTarea,
  agregarTarea,
  buscarTareas,
  completarTarea,
  listarAreas,
  listarPersonas,
  obtenerBrief,
  obtenerMetricas,
  type Resolucion,
} from "@tablero/db";
import { hoyLocal } from "@tablero/db/client";

export const maxDuration = 60;
export const runtime = "nodejs";

// ============================================================
// Formateo
//
// Las herramientas devuelven texto ya legible, no JSON crudo. La idea es que
// el modelo del otro lado no tenga que reformatear nada para contestarte
// "qué tengo pendiente hoy", y que la respuesta sea consistente siempre.
// ============================================================

function texto(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function marcaPrioridad(p: string): string {
  return p === "alta" ? " [alta]" : p === "baja" ? " [baja]" : "";
}

function lineaCorta(t: LineaBrief | TareaExpandida): string {
  const partes: string[] = [];
  if (t.area) partes.push(t.area);
  if (t.persona) partes.push(`con ${t.persona}`);

  const limite = fechaRelativaLegible(t.fecha_limite, hoyLocal());
  if (limite) partes.push(`vence ${limite}`);

  const meta = partes.length ? ` (${partes.join(" · ")})` : "";
  return `- ${t.titulo}${marcaPrioridad(t.prioridad)}${meta}  ·  id: ${t.id.slice(0, 8)}`;
}

function describirTarea(t: TareaExpandida): string {
  const filas = [
    `Tarea: ${t.titulo}`,
    `Estado: ${ETIQUETA_ESTADO[t.estado]}`,
    `Prioridad: ${t.prioridad}`,
    t.area ? `Área: ${t.area}` : "Área: sin asignar",
    t.persona ? `Persona: ${t.persona}` : null,
    t.fecha_foco ? `Foco: ${t.fecha_foco}` : null,
    t.fecha_limite ? `Límite: ${t.fecha_limite}` : null,
    t.detalle ? `Detalle: ${t.detalle}` : null,
    `id: ${t.id}`,
  ];
  return filas.filter(Boolean).join("\n");
}

/** Cuando hay ambigüedad, preferimos preguntar antes que tocar la tarea equivocada. */
function formatearResolucion(r: Resolucion, exito: string) {
  if (r.tipo === "ninguna") {
    return texto(
      "No encontré ninguna tarea con esa referencia. Podés buscarla con buscar_tareas o crearla con agregar_tarea.",
    );
  }
  if (r.tipo === "varias") {
    return texto(
      `Hay ${r.candidatas.length} tareas que coinciden. ¿Cuál de estas?\n\n` +
        r.candidatas.map(lineaCorta).join("\n"),
    );
  }
  return texto(`${exito}\n\n${describirTarea(r.tarea)}`);
}

// ============================================================
// Servidor
// ============================================================

const handler = createMcpHandler(
  (server) => {
    // --------------------------------------------------------
    // Lectura
    // --------------------------------------------------------

    server.registerTool(
      "brief_del_dia",
      {
        title: "Brief del día",
        description:
          "Devuelve todo lo que requiere atención hoy, ya agrupado y priorizado: vencido, con vencimiento hoy, en curso, arrastrado de días anteriores, esperando a terceros y sin clasificar. Es la herramienta para responder '¿qué tengo pendiente hoy?' o '¿cómo vengo?'.",
        inputSchema: z.object({}),
      },
      async () => {
        const brief = await obtenerBrief();

        if (brief.lineas.length === 0) {
          return texto(
            "El tablero está limpio: no hay nada vencido, en curso ni pendiente de clasificar.",
          );
        }

        const orden = [
          "vencida",
          "vence_hoy",
          "en_curso",
          "foco_hoy",
          "arrastrada",
          "esperando",
          "sin_clasificar",
          "proxima",
        ];

        const bloques = orden
          .filter((m) => brief.grupos[m]?.length)
          .map((m) => {
            const lineas = brief.grupos[m];
            return `${ETIQUETA_MOTIVO[m] ?? m} (${lineas.length})\n${lineas
              .map(lineaCorta)
              .join("\n")}`;
          });

        const c = brief.conteos;
        const resumen = `${c.total} tareas requieren atención · ${c.vencidas} vencidas · ${c.en_curso} en curso · ${c.sin_clasificar} sin clasificar`;

        return texto(
          `Brief del ${brief.fecha}\n${resumen}\n\n${bloques.join("\n\n")}`,
        );
      },
    );

    server.registerTool(
      "buscar_tareas",
      {
        title: "Buscar tareas",
        description:
          "Busca tareas por texto, área, persona, estado, prioridad o vencimiento. Usala para consultas como 'qué tengo de Claro', 'qué estoy esperando de Roger' o 'mostrame todo lo vencido'. Por defecto excluye las hechas y archivadas.",
        inputSchema: buscarTareasSchema,
      },
      async (filtros) => {
        const tareas = await buscarTareas(filtros);
        if (tareas.length === 0) {
          return texto("No hay tareas que coincidan con esos filtros.");
        }
        return texto(
          `${tareas.length} tarea(s):\n\n${tareas.map(lineaCorta).join("\n")}`,
        );
      },
    );

    server.registerTool(
      "contexto_tablero",
      {
        title: "Contexto del tablero",
        description:
          "Lista las áreas (los campos del tablero) y las personas registradas. Conviene llamarla antes de crear tareas si no estás seguro de cómo se llama un área, para no crear duplicados por nombres parecidos.",
        inputSchema: z.object({}),
      },
      async () => {
        const [areas, personas] = await Promise.all([
          listarAreas(),
          listarPersonas(),
        ]);

        const bloqueAreas = areas
          .map((a) => `- ${a.nombre}${a.descripcion ? `: ${a.descripcion}` : ""}`)
          .join("\n");

        const bloquePersonas = personas
          .map((p) => `- ${p.nombre}${p.rol ? ` (${p.rol})` : ""}`)
          .join("\n");

        return texto(
          `Áreas del tablero:\n${bloqueAreas}\n\nPersonas registradas:\n${bloquePersonas}\n\nEstados posibles: ${Object.values(
            ETIQUETA_ESTADO,
          ).join(", ")}.`,
        );
      },
    );

    server.registerTool(
      "metricas",
      {
        title: "Métricas del tablero",
        description:
          "Devuelve el estado general: tareas abiertas por área y por estado, completadas en los últimos 7 y 30 días, vencidas, sin clasificar, qué estás esperando de quién, y la antigüedad promedio de lo abierto. Usala para '¿cómo estoy?' o '¿cómo vengo este mes?'.",
        inputSchema: z.object({}),
      },
      async () => {
        const m = await obtenerMetricas();

        const areas = m.abiertas_por_area
          .map((a) => `  ${a.area}: ${a.cantidad}`)
          .join("\n");

        const estados = m.abiertas_por_estado
          .map((e) => `  ${ETIQUETA_ESTADO[e.estado as never] ?? e.estado}: ${e.cantidad}`)
          .join("\n");

        const esperando = m.esperando_por_persona.length
          ? m.esperando_por_persona
              .map((p) => `  ${p.persona}: ${p.cantidad}`)
              .join("\n")
          : "  nada pendiente de terceros";

        return texto(
          [
            "Métricas del tablero",
            "",
            `Completadas últimos 7 días: ${m.completadas_ultimos_7}`,
            `Completadas últimos 30 días: ${m.completadas_ultimos_30}`,
            `Creadas últimos 7 días: ${m.creadas_ultimos_7}`,
            `Vencidas: ${m.vencidas}`,
            `Sin clasificar: ${m.sin_clasificar}`,
            `Antigüedad promedio de lo abierto: ${
              m.edad_promedio_dias ?? "s/d"
            } días`,
            "",
            "Abiertas por área:",
            areas || "  ninguna",
            "",
            "Abiertas por estado:",
            estados || "  ninguna",
            "",
            "Esperando respuesta de:",
            esperando,
          ].join("\n"),
        );
      },
    );

    // --------------------------------------------------------
    // Escritura
    // --------------------------------------------------------

    server.registerTool(
      "agregar_tarea",
      {
        title: "Agregar tarea",
        description:
          "Crea una tarea en el tablero. El área y la persona se resuelven por aproximación, así que alcanza con decir 'Implementacion' o 'Roger'. Las fechas aceptan lenguaje natural: hoy, mañana, el lunes, en 3 días. Si no se indica área, la tarea queda en inbox para clasificar después: eso es preferible a inventar una clasificación.",
        inputSchema: agregarTareaSchema,
      },
      async (entrada) => {
        const tarea = await agregarTarea(entrada, "chat");

        const avisos: string[] = [];
        if (!tarea.area) {
          avisos.push(
            "Quedó sin área, en el inbox. Decime en qué campo va y la muevo.",
          );
        }
        if (entrada.fecha_limite && !tarea.fecha_limite) {
          avisos.push(
            `No pude interpretar "${entrada.fecha_limite}" como fecha, así que quedó sin límite.`,
          );
        }
        if (entrada.fecha_foco && !tarea.fecha_foco) {
          avisos.push(
            `No pude interpretar "${entrada.fecha_foco}" como fecha de foco.`,
          );
        }

        return texto(
          `Tarea agregada.\n\n${describirTarea(tarea)}${
            avisos.length ? `\n\n${avisos.join("\n")}` : ""
          }`,
        );
      },
    );

    server.registerTool(
      "actualizar_tarea",
      {
        title: "Actualizar tarea",
        description:
          "Modifica una tarea existente: cambiarla de área, asignarle una persona, cambiar estado o prioridad, mover fechas o reescribir el título. La tarea se identifica por id o por parte del título; si hay más de una coincidencia devuelve las opciones para desambiguar en lugar de elegir por su cuenta.",
        inputSchema: actualizarTareaSchema,
      },
      async (entrada) => {
        const r = await actualizarTarea(entrada, "chat");
        return formatearResolucion(r, "Tarea actualizada.");
      },
    );

    server.registerTool(
      "completar_tarea",
      {
        title: "Completar tarea",
        description:
          "Marca una tarea como hecha. Se identifica por id o por parte del título.",
        inputSchema: z.object({
          tarea: z
            .string()
            .describe("El id de la tarea o parte de su título."),
        }),
      },
      async ({ tarea }) => {
        const r = await completarTarea(tarea, "chat");
        return formatearResolucion(r, "Marcada como hecha.");
      },
    );

    server.registerTool(
      "clasificar_inbox",
      {
        title: "Clasificar el inbox",
        description:
          "Devuelve las tareas que están sin clasificar, para el triage de la mañana. Después de llamarla, usá actualizar_tarea para asignarles área y fecha de foco.",
        inputSchema: z.object({}),
      },
      async () => {
        const tareas = await buscarTareas({ estado: ["inbox"], limite: 50 });
        if (tareas.length === 0) {
          return texto("El inbox está vacío. Todo está clasificado.");
        }
        return texto(
          `${tareas.length} tarea(s) sin clasificar:\n\n${tareas
            .map(lineaCorta)
            .join("\n")}\n\nAsignales área y fecha de foco con actualizar_tarea.`,
        );
      },
    );
  },
  {
    serverInfo: {
      name: "tablero-personal",
      version: "1.0.0",
    },
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

// ============================================================
// Autenticación
//
// Portal de un solo usuario: un bearer token estático alcanza y evita
// montar un authorization server completo. El token va en la config del
// conector. Si algún día lo compartís, esto hay que cambiarlo por OAuth.
// ============================================================

async function conAuth(req: Request): Promise<Response> {
  const esperado = process.env.MCP_TOKEN;

  if (!esperado) {
    return Response.json(
      { error: "El servidor no tiene MCP_TOKEN configurado." },
      { status: 500 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const recibido = header.replace(/^Bearer\s+/i, "");

  const esperadoBuffer = Buffer.from(esperado);
  const recibidoBuffer = Buffer.from(recibido);
  const valido =
    esperadoBuffer.length === recibidoBuffer.length &&
    timingSafeEqual(esperadoBuffer, recibidoBuffer);

  if (!valido) {
    return Response.json(
      { error: "Token inválido o ausente." },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="tablero", error="invalid_token"',
        },
      },
    );
  }

  return handler(req);
}

export { conAuth as GET, conAuth as POST };
