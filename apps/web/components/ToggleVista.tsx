"use client";

export function ToggleVista({
  modo,
  onChange,
}: {
  modo: "barras" | "tortas";
  onChange: (m: "barras" | "tortas") => void;
}) {
  return (
    <div className="toggle-vista">
      <button
        className={"toggle-vista-btn" + (modo === "barras" ? " toggle-vista-activo" : "")}
        aria-pressed={modo === "barras"}
        onClick={() => onChange("barras")}
      >
        Barras
      </button>
      <button
        className={"toggle-vista-btn" + (modo === "tortas" ? " toggle-vista-activo" : "")}
        aria-pressed={modo === "tortas"}
        onClick={() => onChange("tortas")}
      >
        Tortas
      </button>
    </div>
  );
}