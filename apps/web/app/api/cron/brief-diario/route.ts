import {
  ETIQUETA_MOTIVO,
  diasDesdeHoy,
  fechaRelativaLegible,
} from "@tablero/core";
import { obtenerBrief } from "@tablero/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Mismo orden que la vista "Hoy": lo urgente primero. */
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

/** Mismos hex que --area-* en globals.css (el mail no puede usar variables CSS). */
const COLOR_AREA: Record<string, string> = {
  teal: "#0f6e74",
  ochre: "#a66a15",
  plum: "#7a3b67",
  slate: "#45608a",
  moss: "#4f7a3a",
  grey: "#64707d",
};

const FUENTE =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function fechaLegible(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

function envoltorio(fecha: string, contenido: string): string {
  return `
    <body style="margin:0; background:#f7f9fc; font-family:${FUENTE};">
      <div style="max-width:480px; margin:0 auto; padding:32px 16px;">
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
          <div style="background:#1a2540; padding:20px 24px;">
            <p style="margin:0; color:#8896aa; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em;">
              Tablero
            </p>
            <h1 style="margin:4px 0 0; color:#ffffff; font-size:20px; font-weight:700;">
              ${fecha}
            </h1>
          </div>
          <div style="padding:20px 24px;">
            ${contenido}
          </div>
        </div>
      </div>
    </body>
  `;
}

function tarjetaTarea(t: {
  titulo: string;
  area: string | null;
  area_color: string | null;
  persona: string | null;
  estado: string;
  prioridad: string;
  fecha_limite: string | null;
}): string {
  const acento = COLOR_AREA[t.area_color ?? "grey"] ?? COLOR_AREA.grey;
  const dias = diasDesdeHoy(t.fecha_limite);
  const atrasada = dias !== null && dias < 0;

  const meta: string[] = [];
  if (t.area) meta.push(`<span style="color:${acento}; font-weight:500;">${t.area}</span>`);
  if (t.persona) {
    meta.push(
      t.estado === "esperando"
        ? `<span style="color:#d97706;">esperando a ${t.persona}</span>`
        : t.persona,
    );
  }
  if (t.fecha_limite) {
    const texto = atrasada
      ? `venció ${fechaRelativaLegible(t.fecha_limite)}`
      : `vence ${fechaRelativaLegible(t.fecha_limite)}`;
    meta.push(`<span style="color:${atrasada ? "#d92b2b" : "#4a5568"};">${texto}</span>`);
  }
  if (t.prioridad === "alta") {
    meta.push(
      `<span style="background:#fdeaea; color:#b01e1e; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600;">prioridad alta</span>`,
    );
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>
        <td width="4" style="background:${acento}; border-radius:10px 0 0 10px;"></td>
        <td style="background:#ffffff; border:1px solid #e2e8f0; border-left:0; border-radius:0 10px 10px 0; padding:10px 14px;">
          <div style="font-size:14px; color:#1a2540; font-weight:600;">${t.titulo}</div>
          ${
            meta.length
              ? `<div style="margin-top:4px; font-size:12px; color:#4a5568;">${meta.join(" &middot; ")}</div>`
              : ""
          }
        </td>
      </tr>
    </table>
  `;
}

function armarHtml(brief: Awaited<ReturnType<typeof obtenerBrief>>): string {
  const { grupos, conteos } = brief;
  const fecha = fechaLegible(brief.fecha);

  if (conteos.total === 0) {
    return envoltorio(
      fecha,
      `<p style="margin:0; color:#4a5568; font-size:14px;">No tenés nada pendiente hoy.</p>`,
    );
  }

  const secciones = RIELES.filter((r) => grupos[r]?.length)
    .map((r) => {
      const tarjetas = grupos[r].map(tarjetaTarea).join("");
      return `
        <div style="margin-bottom:20px;">
          <h2 style="margin:0 0 8px; font-size:13px; font-weight:600; color:${
            r === "vencida" ? "#d92b2b" : "#1a2540"
          };">
            ${ETIQUETA_MOTIVO[r] ?? r}
            <span style="color:#8896aa; font-weight:400;">(${grupos[r].length})</span>
          </h2>
          ${tarjetas}
        </div>
      `;
    })
    .join("");

  return envoltorio(fecha, secciones);
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const brief = await obtenerBrief();
  const html = armarHtml(brief);

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tablero <onboarding@resend.dev>",
      to: process.env.ADMIN_EMAIL,
      subject:
        brief.conteos.total === 0
          ? "Tablero: nada pendiente hoy"
          : `Tablero: ${brief.conteos.total} tarea(s) para hoy`,
      html,
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    return NextResponse.json(
      { error: "Falló el envío del mail", detalle },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, total: brief.conteos.total });
}
