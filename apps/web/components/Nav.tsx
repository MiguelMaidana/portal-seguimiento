import Link from "next/link";
import { logout } from "../app/auth-actions";

type Pagina = "hoy" | "tareas" | "documentos" | "metricas";

export function Nav({ activa }: { activa: Pagina }) {
  return (
    <nav className="board-nav narrow">
      <Link href="/" aria-current={activa === "hoy" ? "page" : undefined}>
        Hoy
      </Link>
      <Link
        href="/tareas"
        aria-current={activa === "tareas" ? "page" : undefined}
      >
        Tareas
      </Link>
      <Link
        href="/documentos"
        aria-current={activa === "documentos" ? "page" : undefined}
      >
        Documentos
      </Link>
      <Link
        href="/metricas"
        aria-current={activa === "metricas" ? "page" : undefined}
      >
        Métricas
      </Link>
      <form action={logout}>
        <button type="submit">Salir</button>
      </form>
    </nav>
  );
}
