import { ETIQUETA_MOTIVO } from "@tablero/core";
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

function fechaLegible(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

function armarHtml(brief: Awaited<ReturnType<typeof obtenerBrief>>): string {
  const { grupos, conteos } = brief;
  const fecha = fechaLegible(brief.fecha);

  if (conteos.total === 0) {
    return `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a2540;">
        <h1 style="font-size: 20px; margin: 0 0 8px;">Tablero — ${fecha}</h1>
        <p style="color: #4a5568;">No tenés nada pendiente hoy.</p>
      </div>
    `;
  }

  const secciones = RIELES.filter((r) => grupos[r]?.length)
    .map((r) => {
      const items = grupos[r]
        .map(
          (t) => `
            <li style="margin-bottom: 6px;">
              <strong>${t.titulo}</strong>${t.area ? ` — ${t.area}` : ""}${
                t.persona ? ` · ${t.persona}` : ""
              }
            </li>
          `,
        )
        .join("");

      return `
        <h2 style="font-size: 14px; margin: 20px 0 6px; color: ${
          r === "vencida" ? "#d92b2b" : "#1a2540"
        };">
          ${ETIQUETA_MOTIVO[r] ?? r} (${grupos[r].length})
        </h2>
        <ul style="padding-left: 18px; margin: 0; color: #1a2540;">${items}</ul>
      `;
    })
    .join("");

  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px;">
      <h1 style="font-size: 20px; margin: 0 0 8px; padding-bottom: 8px; border-bottom: 2px solid #1a2540; color: #1a2540;">
        Tablero — ${fecha}
      </h1>
      ${secciones}
    </div>
  `;
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
