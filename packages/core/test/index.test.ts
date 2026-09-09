import { describe, expect, it } from "vitest";
import {
  agregarTareaSchema,
  diasDesdeHoy,
  fechaRelativaLegible,
  interpretarFecha,
  normalizar,
  resolverNombre,
} from "../src/index";

const HOY = new Date(2026, 8, 8, 12);

describe("normalización y resolución", () => {
  const areas = [
    { nombre: "Implementación", slug: "implementacion" },
    { nombre: "HUB IA", slug: "hub-ia" },
  ];

  it("normaliza mayúsculas y acentos", () => {
    expect(normalizar("  IMPLEMENTACIÓN ")).toBe("implementacion");
  });

  it("resuelve nombres aproximados", () => {
    expect(
      resolverNombre("Implementacion", areas, (area) => [
        area.nombre,
        area.slug,
      ]),
    ).toEqual(areas[0]);
    expect(
      resolverNombre("hub", areas, (area) => [area.nombre, area.slug]),
    ).toEqual(areas[1]);
  });

  it("no inventa coincidencias lejanas", () => {
    expect(
      resolverNombre("Finanzas", areas, (area) => [area.nombre, area.slug]),
    ).toBeNull();
  });
});

describe("fechas flexibles", () => {
  it.each([
    ["hoy", "2026-09-08"],
    ["mañana", "2026-09-09"],
    ["en 3 días", "2026-09-11"],
    ["el lunes", "2026-09-14"],
    ["fin de mes", "2026-09-30"],
    ["2026-12-24", "2026-12-24"],
  ])("interpreta %s", (entrada, esperado) => {
    expect(interpretarFecha(entrada, HOY)).toBe(esperado);
  });

  it("devuelve null ante una fecha ambigua", () => {
    expect(interpretarFecha("algún día", HOY)).toBeNull();
  });

  it("calcula y presenta distancias", () => {
    expect(diasDesdeHoy("2026-09-07", HOY)).toBe(-1);
    expect(fechaRelativaLegible("2026-09-09", HOY)).toBe("mañana");
  });
});

describe("esquemas", () => {
  it("rechaza tareas sin título", () => {
    expect(agregarTareaSchema.safeParse({ titulo: "" }).success).toBe(false);
  });

  it("acepta una tarea completa", () => {
    expect(
      agregarTareaSchema.safeParse({
        titulo: "Preparar demo",
        area: "HUB IA",
        prioridad: "alta",
        fecha_foco: "mañana",
      }).success,
    ).toBe(true);
  });
});
